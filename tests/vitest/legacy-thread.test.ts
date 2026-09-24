import { legacyDetectionSuite } from "./legacy";

// Uses SharedArrayBuffer; vitest.config.ts serves the COOP/COEP headers it needs.
legacyDetectionSuite("artoolkitNFT_thread.js");
