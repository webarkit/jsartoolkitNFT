/**
 * The light client entry, `@webarkit/jsartoolkit-nft/client` (#765): the page side of the
 * worker tracker and nothing else. It imports no Emscripten module, so its bundle,
 * dist/NFTTracker.client.mjs, holds no WASM: a page that runs the tracker with
 * createNFTTrackerWorker downloads only the worker's build.
 *
 * The full entry points export the same function; this one exists so that a page does not
 * have to load a whole build, WASM included, to get it.
 */
import { createNFTTrackerWorker } from "./tracker/worker/createNFTTrackerWorker";
import type {
  NFTTrackerWorker,
  NFTTrackerWorkerOptions,
} from "./tracker/worker/createNFTTrackerWorker";
import type { BuildName } from "./tracker/worker/selectBuild";
import type {
  AddTargetsOptions,
  FilterConfig,
  FrameGeometry,
  FrameResult,
  NFTTrackerConfig,
  NFTTrackerPatch,
  NFTTrackerSettings,
  OneEuroConfig,
  SkippedFrame,
  TargetInfo,
  TargetLoad,
  TargetLoadReason,
  TargetOrigin,
  TargetResult,
  TrackerFrame,
  Transition,
  Viewport,
} from "./tracker/types";

export { createNFTTrackerWorker };
export type {
  NFTTrackerWorker,
  NFTTrackerWorkerOptions,
  BuildName,
  AddTargetsOptions,
  FilterConfig,
  FrameGeometry,
  FrameResult,
  NFTTrackerConfig,
  NFTTrackerPatch,
  NFTTrackerSettings,
  OneEuroConfig,
  SkippedFrame,
  TargetInfo,
  TargetLoad,
  TargetLoadReason,
  TargetOrigin,
  TargetResult,
  TrackerFrame,
  Transition,
  Viewport,
};
