import { ARToolkitNFT } from "../../ARToolkitNFT_td";
import { browserTargetLoader, createTrackerFactory } from "../NFTTracker";
import { runHost } from "./host";

// The entry of dist/NFTTracker_td.worker.js (#720 D16).
runHost(
  createTrackerFactory(ARToolkitNFT, browserTargetLoader, "worker"),
  "NFTTracker_td.pthread.js",
);
