/**
 * Decides when a marker counts as lost, separately for every marker index.
 *
 * `process()` sees each marker as found or not found on every frame. One missed
 * frame is not a loss — tracking flickers — so a marker is only reported lost
 * once it has gone unseen for longer than `lostAfterMs`. Before #611 this was a
 * single index and a single timestamp, so with two markers in view only one of
 * them could ever be reported lost.
 *
 * `T` is handed back with the loss; the controllers use the marker's last pose,
 * so a `lostNFTMarker` event says where the marker was last seen.
 */
export declare class MarkerLostTracker<T> {
    private readonly lostAfterMs;
    private readonly lastSeen;
    constructor(lostAfterMs?: number);
    /** Record that marker `index` was found at time `now` (ms). */
    markFound(index: number, now: number, payload: T): void;
    /**
     * The last payload recorded for `index`, returned exactly once: on the first
     * call made more than `lostAfterMs` after the marker was last found.
     * Otherwise `undefined`. After reporting, the marker is forgotten until it is
     * found again.
     */
    checkLost(index: number, now: number): T | undefined;
    /** Forget every marker. */
    clear(): void;
}
