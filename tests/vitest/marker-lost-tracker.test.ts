import { describe, it, expect } from "vitest";
import { MarkerLostTracker } from "../../src/MarkerLostTracker";

describe("MarkerLostTracker", () => {
  it("does not report a marker that was never found", () => {
    const tracker = new MarkerLostTracker<string>(200);
    expect(tracker.checkLost(0, 10_000)).toBeUndefined();
  });

  it("does not report a marker within the grace period, including its last millisecond", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "pose");
    expect(tracker.checkLost(0, 1100)).toBeUndefined();
    expect(tracker.checkLost(0, 1200)).toBeUndefined();
  });

  it("reports a marker lost once, with its last payload, after the grace period", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "first");
    tracker.markFound(0, 1050, "last");
    expect(tracker.checkLost(0, 1251)).toBe("last");
    expect(tracker.checkLost(0, 1300)).toBeUndefined();
  });

  it("tracks markers independently", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "pinball");
    tracker.markFound(1, 1000, "kuva");
    tracker.markFound(0, 1200, "pinball");
    expect(tracker.checkLost(1, 1300)).toBe("kuva");
    expect(tracker.checkLost(0, 1300)).toBeUndefined();
  });

  it("reports a marker lost again after it was re-acquired", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "a");
    expect(tracker.checkLost(0, 1300)).toBe("a");
    tracker.markFound(0, 2000, "b");
    expect(tracker.checkLost(0, 2300)).toBe("b");
  });

  it("forgets every marker on clear()", () => {
    const tracker = new MarkerLostTracker<string>(200);
    tracker.markFound(0, 1000, "a");
    tracker.clear();
    expect(tracker.checkLost(0, 5000)).toBeUndefined();
  });
});
