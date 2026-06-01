/**
 * Unit tests for src/server/services/scheduler.service.ts
 * Issue #399: Write tests for cron job unlock scheduler
 *
 * Mocks:
 *  - @/lib/db  → pool.query
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from "@/lib/db";
import { processUnlocks, processExpiries } from "../scheduler.service";

const mockQuery = pool.query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ─── processUnlocks ───────────────────────────────────────────────────────────

describe("processUnlocks", () => {
  it("returns 0 when no gifts are due for unlock", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const count = await processUnlocks();
    expect(count).toBe(0);
  });

  it("returns the number of gifts processed", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "g1" }, { id: "g2" }] }) // SELECT
      .mockResolvedValue({ rows: [] }); // UPDATE calls
    const count = await processUnlocks();
    expect(count).toBe(2);
  });

  it("queries only locked gifts whose unlock_at has passed", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await processUnlocks();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/status\s*=\s*'locked'/i);
    expect(sql).toMatch(/unlock_at/i);
  });

  it("skips gifts that are not yet at their unlock time", async () => {
    // Only gifts with unlock_at <= NOW() should be returned by the query.
    // We verify the WHERE clause contains the time comparison.
    mockQuery.mockResolvedValue({ rows: [] });
    await processUnlocks();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/<=\s*NOW\(\)|<=\s*\$1/i);
  });

  it("does not re-process already-claimed gifts", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await processUnlocks();
    const sql: string = mockQuery.mock.calls[0][0];
    // Must filter by status = 'locked', not 'claimed'
    expect(sql).not.toMatch(/status\s*=\s*'claimed'/i);
  });

  it("handles a database failure gracefully", async () => {
    mockQuery.mockRejectedValue(new Error("DB connection lost"));
    await expect(processUnlocks()).rejects.toThrow("DB connection lost");
  });
});

// ─── processExpiries ──────────────────────────────────────────────────────────

describe("processExpiries", () => {
  it("resolves without throwing when there are no expired gifts", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(processExpiries()).resolves.not.toThrow();
  });

  it("queries only unlocked gifts past the 365-day cutoff", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await processExpiries();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/status\s*=\s*'unlocked'/i);
    expect(sql).toMatch(/unlock_at/i);
  });

  it("handles a database failure gracefully", async () => {
    mockQuery.mockRejectedValue(new Error("timeout"));
    await expect(processExpiries()).rejects.toThrow("timeout");
  });
});
