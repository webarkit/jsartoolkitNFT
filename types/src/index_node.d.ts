import { ARToolkitNFT } from "./ARToolkitNFT_node";
import { ARControllerNFT } from "./ARControllerNFT_node";
import { NFTLoadError } from "./NFTLoadError";
import { ARLogLevel } from "./abstractions/CommonInterfaces";
import type { INFTMarker, INFTMarkerInfo, IImageObj, NFTEvent, NFTEventListener, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions, NFTAR2Settings } from "./abstractions/CommonInterfaces";
import type { NFTTracker, NFTTrackerConfig, NFTTrackerPatch, NFTTrackerSettings, TargetOrigin, TargetInfo, TargetLoad, TargetLoadReason, TargetResult, Transition, FrameResult, SkippedFrame, OneEuroConfig, FilterConfig, TrackerFrame, Viewport, FrameGeometry, AddTargetsOptions } from "./tracker/types";
import type { PoseFilter, PoseFilterModule } from "./tracker/filters/PoseFilter";
/**
 * Creates an NFT tracker on this build's ARToolkitNFT (#720 D2, D10): load targets, then
 * `process(frame, timestampMs)` each frame. The same-thread facade; the controller
 * (ARControllerNFT) is unchanged. `cameraParam` is a path relative to the working
 * directory and the sources are extension-less prefixes, as ARToolkitNFT accepts them.
 */
declare const createNFTTracker: (config: NFTTrackerConfig) => Promise<NFTTracker>;
export { ARToolkitNFT, ARControllerNFT, ARLogLevel, NFTLoadError, createNFTTracker, };
export type { INFTMarker, INFTMarkerInfo, IImageObj, NFTEvent, NFTEventListener, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions, NFTAR2Settings, NFTTracker, NFTTrackerConfig, NFTTrackerPatch, NFTTrackerSettings, TargetOrigin, TargetInfo, TargetLoad, TargetLoadReason, TargetResult, Transition, FrameResult, SkippedFrame, OneEuroConfig, FilterConfig, TrackerFrame, Viewport, FrameGeometry, AddTargetsOptions, PoseFilter, PoseFilterModule, };
