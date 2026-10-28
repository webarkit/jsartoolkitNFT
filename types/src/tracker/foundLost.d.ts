/**
 * Per-target found/lost transitions (D8). Mirrors MarkerLostTracker's rule:
 * a target is lost only once strictly more than lostTimeoutMs has passed since
 * it was last tracked (`now - time <= lostAfterMs` is still "present").
 */
export declare class FoundLost {
    lostTimeoutMs: number;
    /** Last tracked time per target; an entry means the target is present. */
    private lastSeen;
    constructor(lostTimeoutMs: number);
    update(id: number, tracked: boolean, timeMs: number): "found" | "lost" | null;
}
