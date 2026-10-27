/**
 * Custom filter module contract (D14). A module exports `createPoseFilter`,
 * which returns one PoseFilter; the facade creates one filter per marker.
 */
export interface PoseFilter {
  filter(timeMs: number, pose: Float64Array): Float64Array;
  reset(): void;
}
export interface PoseFilterModule {
  createPoseFilter(options: unknown): PoseFilter;
}
