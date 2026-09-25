import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  loadMarkers,
} from "./helpers";
import { VARIANTS } from "./variants";

/**
 * The binding holds per-marker state in fixed arrays of PAGES_MAX (20) entries
 * (`surfaceSet`, `markerStates`), indexed by marker id up to the running
 * marker count. A load that would take the total past 20 must be refused
 * before any state changes, or those arrays are overrun.
 *
 * The second batch here is 19 markers: under the per-batch limit on its own,
 * over the total limit with the 2 already loaded. The refusal happens before
 * any dataset is parsed, so the test is cheap despite the batch size.
 */
const PAGES_MAX = 20;

for (const variant of VARIANTS) {
  describe(`marker limit (${variant.name})`, () => {
    let ar: any;

    beforeAll(async () => {
      const { ARControllerNFT } = await variant.load();
      ar = await ARControllerNFT.initWithDimensions(VIDEO_WIDTH, VIDEO_HEIGHT, CAMERA_PARAM, true);
      const ids = await loadMarkers(ar, [MARKER_PINBALL, MARKER_KUVA]);
      expect(ids).toEqual([0, 1]);
    }, 150_000);

    afterAll(() => {
      ar?.dispose?.();
    });

    it("refuses a load that would exceed PAGES_MAX markers in total", async () => {
      const batch = Array(PAGES_MAX - 1).fill(MARKER_KUVA);
      const ids = await loadMarkers(ar, batch);
      expect(ids).toEqual([]);
      // The two loaded markers are still addressable, and nothing past them is.
      expect(ar.getNFTMarker(1)).toMatchObject({ id: 1 });
      expect(ar.getNFTMarker(2)).toBe(-3);
    }, 120_000);
  });
}
