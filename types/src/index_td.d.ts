/**
 * The multithreaded build (pthreads). It needs a cross-origin isolated page
 * (COOP/COEP headers) for SharedArrayBuffer.
 *
 * @module @webarkit/jsartoolkit-nft/td
 */
import { ARToolkitNFT } from "./ARToolkitNFT_td";
import { ARControllerNFT } from "./ARControllerNFT_td";
import { ARLogLevel } from "./abstractions/CommonInterfaces";
import type { INFTMarker, INFTMarkerInfo, IImageObj, NFTEvent, NFTEventListener, NFTLoadOptions, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions, NFTAR2Settings } from "./abstractions/CommonInterfaces";
import { NFTLoadError } from "./NFTLoadError";
import type { NFTLoadErrorKind } from "./NFTLoadError";
import type { NFTTracker, NFTTrackerConfig, NFTTrackerPatch, NFTTrackerSettings, TargetOrigin, TargetInfo, TargetLoad, TargetLoadReason, TargetResult, Transition, FrameResult, SkippedFrame, OneEuroConfig, FilterConfig, TrackerFrame, Viewport, FrameGeometry, AddTargetsOptions } from "./tracker/types";
import type { PoseFilter, PoseFilterModule } from "./tracker/filters/PoseFilter";
import { createNFTTrackerWorker } from "./tracker/worker/createNFTTrackerWorker";
import type { NFTTrackerWorker, NFTTrackerWorkerOptions } from "./tracker/worker/createNFTTrackerWorker";
import type { BuildName } from "./tracker/worker/selectBuild";
/**
 * Creates an NFT tracker on this build's ARToolkitNFT (#720 D2): load targets, then
 * `process(frame, timestampMs)` each frame. The same-thread facade; the controller
 * (ARControllerNFT) is unchanged.
 *
 * @function
 */
declare const createNFTTracker: (config: NFTTrackerConfig) => Promise<NFTTracker>;
export { ARToolkitNFT, ARControllerNFT, ARLogLevel, NFTLoadError, createNFTTracker, createNFTTrackerWorker, };
export type { INFTMarker, INFTMarkerInfo, IImageObj, NFTEvent, NFTEventListener, NFTLoadOptions, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions, NFTAR2Settings, NFTLoadErrorKind, NFTTracker, NFTTrackerConfig, NFTTrackerPatch, NFTTrackerSettings, TargetOrigin, TargetInfo, TargetLoad, TargetLoadReason, TargetResult, Transition, FrameResult, SkippedFrame, OneEuroConfig, FilterConfig, TrackerFrame, Viewport, FrameGeometry, AddTargetsOptions, PoseFilter, PoseFilterModule, NFTTrackerWorker, NFTTrackerWorkerOptions, BuildName, };
