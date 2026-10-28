import { ARToolkitNFT } from "../../ARToolkitNFT";
import { browserTargetLoader, createTrackerFactory } from "../NFTTracker";
import { runHost } from "./host";

// The entry of dist/NFTTracker.worker.js (#720 D16).
runHost(createTrackerFactory(ARToolkitNFT, browserTargetLoader, "worker"));
