import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardService } from "../services/dashboard.js";

function createSelectMock<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (rows: T[]) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
}

describe("dashboardService.summary", () => {
  let select: ReturnType<typeof vi.fn>;
  let db: { select: typeof select };
  let index = 0;

  beforeEach(() => {
    index = 0;
    select = vi.fn(() => createSelectMock([]));
    db = { select };
  });

  it("ignores rows without status values and still returns summary totals", async () => {
    const rows = [
      [{ id: "company-1", name: "Company", budgetMonthlyCents: 1_000 }],
      [
        { status: null, count: 2 },
        { status: "idle", count: 3 },
        { status: "running", count: 1 },
        { status: "error", count: 2 },
      ],
      [
        { status: null, count: 4 },
        { status: "backlog", count: 5 },
        { status: "in_progress", count: 6 },
        { status: "blocked", count: 7 },
        { status: "done", count: 8 },
        { status: "cancelled", count: 9 },
      ],
      [{ count: 10 }],
      [{ monthSpend: 500 }],
    ];

    select.mockImplementation(() => {
      const result = rows[index] ?? [];
      index += 1;
      return createSelectMock(result);
    });

    const svc = dashboardService(db as never);
    const summary = await svc.summary("company-1");

    expect(summary).toMatchObject({
      agents: { active: 3, running: 1, paused: 0, error: 2 },
      tasks: {
        open: 18,
        inProgress: 6,
        blocked: 7,
        done: 8,
      },
      costs: { monthSpendCents: 500, monthBudgetCents: 1_000 },
      pendingApprovals: 10,
    });
  });
});
