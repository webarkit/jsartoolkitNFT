import { describe, it, expect } from "vitest";
import { expectRealPose } from "./legacy";

/**
 * The pose check every legacy and embed suite relies on. A build that reports a
 * marker as found but fills its pose with zeros or the identity has stopped
 * tracking, and these assertions are what catch it.
 */
describe("expectRealPose", () => {
  it("accepts a detected pose", () => {
    const pose = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 12.5, -30, -250, 1];
    expect(() => expectRealPose(pose)).not.toThrow();
  });

  it("rejects the identity matrix", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(() => expectRealPose(identity)).toThrow();
  });

  it("rejects a zeroed matrix", () => {
    expect(() => expectRealPose(new Array(16).fill(0))).toThrow();
  });

  it("rejects a matrix with a non-finite value", () => {
    const pose = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, NaN, -30, -250, 1];
    expect(() => expectRealPose(pose)).toThrow();
  });
});
