import { describe, expect, it } from "vitest";
import { bucketScores, bucketTrend, round1 } from "@/lib/modules/feedback/server";

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(4.666666)).toBe(4.7);
    expect(round1(3.0)).toBe(3);
    expect(round1(3.04)).toBe(3);
    expect(round1(3.16)).toBe(3.2);
  });
});

describe("bucketScores", () => {
  it("always returns all five buckets, even when empty", () => {
    const result = bucketScores([]);
    expect(result).toEqual([
      { score: 1, count: 0 },
      { score: 2, count: 0 },
      { score: 3, count: 0 },
      { score: 4, count: 0 },
      { score: 5, count: 0 },
    ]);
  });

  it("counts each score into its own bucket", () => {
    const result = bucketScores([1, 1, 3, 5, 5, 5]);
    const byScore = Object.fromEntries(result.map((b) => [b.score, b.count]));
    expect(byScore).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0, 5: 3 });
  });

  it("clamps out-of-range values instead of dropping them", () => {
    const result = bucketScores([0, 6, -3, 12]);
    const byScore = Object.fromEntries(result.map((b) => [b.score, b.count]));
    expect(byScore[1]).toBe(2); // 0 and -3 clamp to 1
    expect(byScore[5]).toBe(2); // 6 and 12 clamp to 5
  });

  it("rounds fractional overall scores to the nearest bucket", () => {
    const result = bucketScores([4.6, 4.4]);
    const byScore = Object.fromEntries(result.map((b) => [b.score, b.count]));
    expect(byScore[5]).toBe(1); // 4.6 rounds up
    expect(byScore[4]).toBe(1); // 4.4 rounds down
  });
});

describe("bucketTrend", () => {
  it("fills every day in the range, including days with no data", () => {
    const from = new Date("2025-01-01T00:00:00.000Z");
    const to = new Date("2025-01-03T23:59:59.999Z");
    const result = bucketTrend(
      [{ date: new Date("2025-01-01T10:00:00.000Z"), score: 4 }],
      from,
      to,
    );
    expect(result.map((r) => r.date)).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
    expect(result[0]).toEqual({ date: "2025-01-01", count: 1, avgScore: 4 });
    expect(result[1]).toEqual({ date: "2025-01-02", count: 0, avgScore: null });
  });

  it("averages multiple scores on the same day", () => {
    const from = new Date("2025-01-01T00:00:00.000Z");
    const to = new Date("2025-01-01T23:59:59.999Z");
    const result = bucketTrend(
      [
        { date: new Date("2025-01-01T09:00:00.000Z"), score: 5 },
        { date: new Date("2025-01-01T18:00:00.000Z"), score: 3 },
      ],
      from,
      to,
    );
    expect(result).toEqual([{ date: "2025-01-01", count: 2, avgScore: 4 }]);
  });
});
