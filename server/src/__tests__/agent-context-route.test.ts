import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  resolveByReference: vi.fn(),
  resolveByReferenceOrFail: vi.fn(),
  getChainOfCommand: vi.fn(),
  getByShortname: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  createApiKey: vi.fn(),
  getRuntimeState: vi.fn(),
  getConfigRevisions: vi.fn(),
  getConfigRevision: vi.fn(),
  rollbackConfigRevision: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  isInstanceAdmin: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listMembers: vi.fn(),
  setMemberPermissions: vi.fn(),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  setUserCompanyAccess: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  getRun: vi.fn(),
  list: vi.fn(),
  cancelRun: vi.fn(),
  getRuntimeState: vi.fn(),
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
  listEvents: vi.fn(),
  readLog: vi.fn(),
  wakeup: vi.fn(),
  invoke: vi.fn(),
  reapOrphanedRuns: vi.fn(),
  tickTimers: vi.fn(),
  cancelActiveForAgent: vi.fn(),
}));

const mockIssueApprovalsService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
  create: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getComment: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

const mockSecretService = vi.hoisted(() => ({
  resolveAdapterConfigForRuntime: vi.fn(),
  normalizeAdapterConfigForPersistence: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  accessService: () => mockAccessService,
  approvalService: () => mockApprovalService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalsService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
  notifyHireApproved: vi.fn(),
  deduplicateAgentName: vi.fn(),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor as never;
    next();
  });
  app.use("/api", agentRoutes({}));
  app.use(errorHandler);
  return app;
}

describe("GET /api/agent/context", () => {
  beforeEach(() => {
    mockHeartbeatService.getRun.mockReset();
    mockIssueService.getById.mockReset();
    mockIssueService.getComment.mockReset();
    mockLogActivity.mockReset();
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(true);
  });

  it("returns run context with issue and wake comment", async () => {
    const run = {
      id: "run-1",
      companyId: "company-1",
      contextSnapshot: {
        issueId: "issue-1",
        commentId: "comment-1",
        wakeReason: "issue_commented",
      },
    };
    const issue = { id: "issue-1", companyId: "company-1", title: "Bug in API" };
    const comment = { id: "comment-1", issueId: "issue-1", body: "Please fix this issue." };

    mockHeartbeatService.getRun.mockResolvedValue(run);
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.getComment.mockResolvedValue(comment);

    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agent/context");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      run,
      issue,
      wakeComment: comment,
    });
    expect(mockHeartbeatService.getRun).toHaveBeenCalledWith("run-1");
    expect(mockIssueService.getById).toHaveBeenCalledWith("issue-1");
    expect(mockIssueService.getComment).toHaveBeenCalledWith("comment-1");
  });

  it("returns run context with issue only for non-comment wake", async () => {
    const run = {
      id: "run-2",
      companyId: "company-1",
      contextSnapshot: {
        issueId: "issue-2",
        wakeReason: "issue_assigned",
      },
    };
    const issue = { id: "issue-2", companyId: "company-1", title: "Add docs" };

    mockHeartbeatService.getRun.mockResolvedValue(run);
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.getComment.mockResolvedValue(null);

    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: "run-2",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agent/context");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ run, issue, wakeComment: null });
    expect(mockIssueService.getComment).not.toHaveBeenCalled();
  });

  it("requires an agent with a run ID", async () => {
    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agent/context");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Missing agent run ID" });
    expect(mockHeartbeatService.getRun).not.toHaveBeenCalled();
  });

  it("returns 404 when run is not found", async () => {
    mockHeartbeatService.getRun.mockResolvedValue(null);

    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: "missing-run",
      source: "agent_key",
    });

    const res = await request(app).get("/api/agent/context");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Heartbeat run not found" });
    expect(mockIssueService.getById).not.toHaveBeenCalled();
    expect(mockIssueService.getComment).not.toHaveBeenCalled();
  });

  it("denies non-agent callers", async () => {
    const app = createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
    });

    const res = await request(app).get("/api/agent/context");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Agent authentication required" });
    expect(mockHeartbeatService.getRun).not.toHaveBeenCalled();
  });
});
