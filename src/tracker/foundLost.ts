/**
 * Per-target found/lost transitions (D8). Mirrors MarkerLostTracker's rule:
 * a target is lost only once strictly more than lostTimeoutMs has passed since
 * it was last tracked (`now - time <= lostAfterMs` is still "present").
 */
export class FoundLost {
  lostTimeoutMs: number;
  /** Last tracked time per target; an entry means the target is present. */
  private lastSeen = new Map<number, number>();

  constructor(lostTimeoutMs: number) {
    this.lostTimeoutMs = lostTimeoutMs;
  }

  update(id: number, tracked: boolean, timeMs: number): "found" | "lost" | null {
    const last = this.lastSeen.get(id);
    if (tracked) {
      this.lastSeen.set(id, timeMs);
      return last === undefined ? "found" : null;
    }
    if (last === undefined || timeMs - last <= this.lostTimeoutMs) {
      return null;
    }
    this.lastSeen.delete(id);
    return "lost";
  }
}
