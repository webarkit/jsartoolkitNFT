import type { NFTAR2Settings } from "../abstractions/CommonInterfaces";
import type { PoseFilter } from "./filters/PoseFilter";

export type TargetOrigin = "corner" | "center";
export interface TargetInfo {
  id: number;
  url: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  widthMm: number;
  heightMm: number;
  origin: TargetOrigin;
}
export type TargetLoadReason = "network" | "format" | "capacity" | "unknown";
export type TargetLoad =
  | { status: "loaded"; info: TargetInfo }
  | { status: "error"; url: string; reason: TargetLoadReason; message: string };
export interface TargetResult {
  id: number;
  found: boolean;
  pose: Float64Array | null;
  error: number | null;
}
export interface Transition {
  type: "found" | "lost";
  id: number;
}
export interface FrameResult {
  time: number;
  processMs: number;
  targets: TargetResult[];
  transitions: Transition[];
}
export interface SkippedFrame {
  skipped: true;
}
/** Defaults 0.0001, 0.01, 0 (D19). */
export interface OneEuroConfig {
  type: "oneEuro";
  minCutOff?: number;
  beta?: number;
  warmUp?: number;
}
export type FilterConfig =
  | "none"
  | "native"
  | OneEuroConfig
  | { module: string; options?: unknown }
  | { create: (options: unknown) => PoseFilter; options?: unknown }; // same thread only (D3)
export interface NFTTrackerSettings {
  lostTimeout: number;
  filter: FilterConfig;
  logLevel: number;
  near: number;
  far: number;
  continuousDetection: boolean;
  detectionInterval: number;
  ar2: NFTAR2Settings;
}
export type NFTTrackerPatch = Partial<Omit<NFTTrackerSettings, "ar2">> & {
  ar2?: Partial<NFTAR2Settings>;
};
export interface NFTTrackerConfig extends NFTTrackerPatch {
  width: number;
  height: number;
  cameraParam: string | Uint8Array;
}
export type TrackerFrame =
  | ImageData
  | ImageBitmap
  | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
/** `fit` defaults to "contain". */
export interface Viewport {
  width: number;
  height: number;
  fit?: "contain" | "cover";
}
export interface FrameGeometry {
  frameWidth: number;
  frameHeight: number;
  videoWidth: number;
  videoHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}
/** `origin` defaults to "corner". */
export interface AddTargetsOptions {
  origin?: TargetOrigin;
}
export interface NFTTracker {
  readonly cameraMatrix: Float64Array;
  /** Returns a Promise because a `{ module }` filter loads asynchronously (D14). */
  configure(patch: NFTTrackerPatch): Promise<void>;
  addNFTTargets(sources: string[], opts?: AddTargetsOptions): Promise<TargetLoad[]>;
  process(frame: TrackerFrame, timestampMs: number): FrameResult;
  projectionFor(viewport: Viewport, geometry?: FrameGeometry): Float64Array;
  dispose(): void;
}
