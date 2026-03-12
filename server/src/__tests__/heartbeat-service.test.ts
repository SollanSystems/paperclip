import { beforeEach, describe, expect, it, vi } from "vitest";
import { heartbeatService } from "../services/heartbeat.js";

function createSelectMock<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (rows: T[]) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
}

describe("heartbeatService.tickTimers", () => {
  let select: ReturnType<typeof vi.fn>;
  let db: { select: typeof select };

  beforeEach(() => {
    select = vi.fn(() => createSelectMock([]));
    db = { select };
  });

  it("skips entries without a status without throwing", async () => {
    select.mockReturnValue(
      createSelectMock([
        {
          id: "agent-1",
          companyId: "company-1",
          status: null,
          lastHeartbeatAt: new Date(),
          createdAt: new Date(),
          runtimeConfig: null,
        },
      ]),
    );

    const svc = heartbeatService(db as never);
    const stats = await svc.tickTimers(new Date());

    expect(stats).toEqual({ checked: 0, enqueued: 0, skipped: 1 });
  });

  it("respects heartbeat interval guard for valid agents", async () => {
    select.mockReturnValue(
      createSelectMock([
        {
          id: "agent-1",
          companyId: "company-1",
          status: "idle",
          lastHeartbeatAt: new Date(Date.now() - 3_600_000),
          createdAt: new Date(Date.now() - 3_600_000),
          runtimeConfig: {
              heartbeat: {
              intervalSec: 0,
            },
          },
        },
      ]),
    );

    const svc = heartbeatService(db as never);
    const stats = await svc.tickTimers(new Date(Date.now() + 60_000));

    expect(stats).toEqual({ checked: 0, enqueued: 0, skipped: 0 });
  });
});
