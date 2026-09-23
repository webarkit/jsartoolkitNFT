import { describe, it, expect, beforeAll, vi } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";
import {
  COMPOSITE_WIDTH,
  COMPOSITE_HEIGHT,
  loadCompositeFrames,
  isFound,
  processUntil,
} from "./frames";
import { VARIANTS } from "./variants";

/**
 * Several markers tracked at once (#635, #613, #611).
 *
 * `pinball-demo.jpg` carries both printed targets — pinball on the left, kuva on the
 * right — and the `pinballOnly` frame is the same photo with the kuva print painted over.
 * Every test establishes the state it needs with `processUntil`, so the order
 * of tests does not matter.
 */
for (const variant of VARIANTS) {
  for (const filtering of [true, false]) {
    describe(`two markers in view (${variant.name}, filtering ${filtering ? "on" : "off"})`, () => {
      let ar: any;
      let frames: { both: ImageData; pinballOnly: ImageData };

      beforeAll(async () => {
        const { ARControllerNFT } = await variant.load();
        frames = await loadCompositeFrames();
        ar = await ARControllerNFT.initWithDimensions(
          COMPOSITE_WIDTH,
          COMPOSITE_HEIGHT,
          CAMERA_PARAM,
          true,
        );
        ar.setFiltering(filtering);
        const ids = await loadMarkers(ar, [MARKER_PINBALL, MARKER_KUVA]);
        expect(ids).toEqual([0, 1]);
        ids.forEach((id) => ar.trackNFTMarkerId(id));
      }, 150_000);

      it("finds both markers in the same frame", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        expect(isFound(ar, 0)).toBe(true);
        expect(isFound(ar, 1)).toBe(true);
      });

      it("fires getNFTMarker exactly once for each marker per process()", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const seen: number[] = [];
        const onGet = (e: any) => seen.push(e.data.index);
        ar.addEventListener("getNFTMarker", onGet);
        ar.process(frames.both);
        ar.removeEventListener("getNFTMarker", onGet);
        expect(seen.sort()).toEqual([0, 1]);
      });

      it("gives the two markers different poses", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const pinballPose = Array.from(ar.getNFTMarker(0).pose as ArrayLike<number>);
        const kuvaPose = Array.from(ar.getNFTMarker(1).pose as ArrayLike<number>);
        // pose is a row-major 3x4 [R|t]; index 3 is the x translation. Pinball
        // is on the left of the frame and kuva on the right.
        expect(pinballPose[3]).toBeLessThan(kuvaPose[3]);
      });

      it("keeps tracking pinball after kuva leaves the frame", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        await processUntil(ar, frames.pinballOnly, () => !isFound(ar, 1));
        expect(isFound(ar, 0)).toBe(true);
      });

      it("returns MARKER_INDEX_OUT_OF_BOUNDS (-3) for an index outside the loaded markers", () => {
        expect(ar.getNFTMarker(-1)).toBe(-3);
        expect(ar.getNFTMarker(2)).toBe(-3);
      });

      it("gives each getNFTMarker event its own matrix", async () => {
        await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));
        const events: { ref: Float64Array; copy: number[] }[] = [];
        const onGet = (e: any) =>
          events.push({ ref: e.data.matrix, copy: Array.from(e.data.matrix as Float64Array) });
        ar.addEventListener("getNFTMarker", onGet);
        ar.process(frames.both);
        ar.removeEventListener("getNFTMarker", onGet);

        expect(events.length).toBe(2);
        expect(events[0].ref).not.toBe(events[1].ref);
        // A listener that kept the matrix still sees the values it was given.
        for (const event of events) {
          expect(Array.from(event.ref)).toEqual(event.copy);
        }
      });

      it("reports kuva lost while pinball stays tracked", async () => {
        let clock = 1_000_000;
        const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);
        try {
          await processUntil(ar, frames.both, () => isFound(ar, 0) && isFound(ar, 1));

          const lost: number[] = [];
          const onLost = (e: any) => lost.push(e.data.index);
          ar.addEventListener("lostNFTMarker", onLost);

          // Remove kuva; advance 50 ms per frame until the loss is reported.
          for (let i = 0; i < 60 && lost.length === 0; i++) {
            clock += 50;
            ar.process(frames.pinballOnly);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          expect(lost).toEqual([1]);

          // Afterwards pinball keeps being reported, kuva does not come back,
          // and nothing else is reported lost.
          const kept: number[] = [];
          const onGet = (e: any) => kept.push(e.data.index);
          ar.addEventListener("getNFTMarker", onGet);
          for (let i = 0; i < 10; i++) {
            clock += 50;
            ar.process(frames.pinballOnly);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          ar.removeEventListener("getNFTMarker", onGet);
          ar.removeEventListener("lostNFTMarker", onLost);

          expect(kept.length).toBeGreaterThan(0);
          expect(kept.every((index) => index === 0)).toBe(true);
          expect(lost).toEqual([1]);
        } finally {
          nowSpy.mockRestore();
        }
      });
    });
  }
}
