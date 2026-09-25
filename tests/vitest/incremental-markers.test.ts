import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  loadMarker,
} from "./helpers";
import { loadCompositeFrames, isFound, processUntil } from "./frames";
import { VARIANTS } from "./variants";

/**
 * Loading NFT markers across several calls (#612).
 *
 * `addNFTMarkers()` used to derive marker ids, KPM page numbers and surface-set
 * slots from its loop counter, which restarts at 0 on every call, and handed
 * `kpmSetRefDataSet()` only the markers of the current call. A second call
 * therefore reused id 0, overwrote the first marker's surface set, and replaced
 * the KPM data, so the first marker could no longer be detected.
 *
 * The tests run in order and build on each other: pinball is loaded, then kuva
 * in a separate call, then pinball again in a third. The detection test is the
 * one that matters most: both markers, loaded by separate calls, must be found
 * in the same photo.
 *
 * Marker loading reports failure by never calling back, so `loadMarker()` has a
 * timeout: without it a regression here would hang rather than fail.
 */
for (const variant of VARIANTS) {
  describe(`incremental addNFTMarkers (#612, ${variant.name})`, () => {
    let ar: any;
    let frames: { both: ImageData; width: number; height: number };

    beforeAll(async () => {
      const { ARControllerNFT } = await variant.load();
      frames = await loadCompositeFrames();
      ar = await ARControllerNFT.initWithDimensions(
        frames.width,
        frames.height,
        CAMERA_PARAM,
        true,
      );
    }, 150_000);

    afterAll(() => {
      ar?.dispose?.();
    });

    it("assigns id 0 to the first marker", async () => {
      const id = await loadMarker(ar, MARKER_PINBALL);
      expect(id).toBe(0);
      ar.trackNFTMarkerId(id);
    });

    it("assigns id 1 to a marker loaded in a second call", async () => {
      const id = await loadMarker(ar, MARKER_KUVA);
      expect(id).toBe(1);
      ar.trackNFTMarkerId(id);
    });

    it("counts both markers", () => {
      expect(ar.nftMarkerCount).toBe(2);
    });

    it("keeps the first marker's data after the second call", () => {
      // pinball is 893 x 1117 at 120 dpi; kuva is a different size, so a first
      // marker overwritten by the second call would report kuva's size here.
      const first = ar.getNFTData(0);
      expect(first.width).toBe(893);
      expect(first.height).toBe(1117);
    });

    it("exposes data for the second marker", () => {
      const second = ar.getNFTData(1);
      expect(second.width).toBeGreaterThan(0);
      expect(second.width).not.toBe(893);
    });

    it("detects both markers loaded in separate calls", async () => {
      await processUntil(
        ar,
        frames.both,
        () => isFound(ar, 0) && isFound(ar, 1),
      );
      expect(isFound(ar, 0)).toBe(true);
      expect(isFound(ar, 1)).toBe(true);
    });

    it("continues the sequence for a third marker", async () => {
      const id = await loadMarker(ar, MARKER_PINBALL);
      expect(id).toBe(2);
      expect(ar.nftMarkerCount).toBe(3);
    });
  });
}
