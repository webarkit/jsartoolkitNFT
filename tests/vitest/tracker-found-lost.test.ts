import { describe, it, expect } from "vitest";
import { FoundLost } from "../../src/tracker/foundLost";

describe("FoundLost", () => {
  it("found once on the first tracked frame", () => {
    const fl = new FoundLost(200);
    expect(fl.update(0, true, 0)).toBe("found");
    expect(fl.update(0, true, 16)).toBeNull();
  });
  it("lost after more than lostTimeout, exactly once, then found again", () => {
    const fl = new FoundLost(200);
    fl.update(0, true, 0);
    expect(fl.update(0, false, 100)).toBeNull();
    expect(fl.update(0, false, 200)).toBeNull();
    expect(fl.update(0, false, 201)).toBe("lost");
    expect(fl.update(0, false, 300)).toBeNull();
    expect(fl.update(0, true, 400)).toBe("found");
  });
  it("re-tracked inside the grace window gives no transition", () => {
    const fl = new FoundLost(200);
    expect(fl.update(0, true, 0)).toBe("found");
    expect(fl.update(0, false, 100)).toBeNull();
    expect(fl.update(0, true, 150)).toBeNull();
  });
  it("targets are independent", () => {
    const fl = new FoundLost(200);
    expect(fl.update(0, true, 0)).toBe("found");
    expect(fl.update(1, true, 10)).toBe("found");
    expect(fl.update(0, false, 250)).toBe("lost");
    expect(fl.update(1, true, 250)).toBeNull();
    expect(fl.update(1, false, 300)).toBeNull();
  });
  it("lostTimeoutMs is live", () => {
    const fl = new FoundLost(200);
    fl.update(0, true, 0);
    fl.lostTimeoutMs = 50;
    expect(fl.update(0, false, 51)).toBe("lost");
  });
  it("never-tracked target gives null", () => {
    const fl = new FoundLost(200);
    expect(fl.update(5, false, 0)).toBeNull();
    expect(fl.update(5, false, 100000)).toBeNull();
  });
});
