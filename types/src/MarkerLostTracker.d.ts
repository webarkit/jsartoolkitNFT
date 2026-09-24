export declare class MarkerLostTracker<T> {
    private readonly lostAfterMs;
    private readonly lastSeen;
    constructor(lostAfterMs?: number);
    markFound(index: number, now: number, payload: T): void;
    checkLost(index: number, now: number): T | undefined;
    clear(): void;
}
