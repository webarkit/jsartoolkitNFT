import { legacyDetectionSuite } from "./legacy";

// The debug build's allocator checks catch the teardown double free that the
// other legacy builds hit silently (#663); see `disposeAborts` in legacy.ts.
legacyDetectionSuite("artoolkitNFT.debug.js", { disposeAborts: true });
