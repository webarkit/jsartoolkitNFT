import { ARToolkitNFT } from "../../ARToolkitNFT_simd";
import { browserTargetLoader, createTrackerFactory } from "../NFTTracker";
import { runHost } from "./host";

// The entry of dist/NFTTracker_simd.worker.js (#720 D16).
runHost(createTrackerFactory(ARToolkitNFT, browserTargetLoader, "worker"));
