import { describe, it, expect, beforeAll, vi } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";
import {
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
      let frames: { both: ImageData; pinballOnly: ImageData; width: number; height: number };

      beforeAll(async () => {
        const { ARControllerNFT } = await variant.load();
        frames = await loadCompositeFrames(variant.frameScale);
        ar = await ARControllerNFT.initWithDimensions(
          frames.width,
          frames.height,
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

      // Detection policy. Each test sets the policy it needs and puts the build's
      // defaults back at the end, so test order does not matter.
      const restoreDetectionDefaults = () => {
        ar.setContinuousDetection(true);
        ar.setDetectionInterval(variant.detectionIntervalMs);
      };

      /**
       * Push `frame` at least `count` times and for at least `minMs`, yielding between
       * frames. The time floor matters for the threaded build: 20 frames there pass in
       * less time than one worker search takes, so without it a detection that should
       * have been gated would not have finished yet either.
       */
      const processFrames = async (frame: ImageData, count: number, minMs = 0) => {
        const start = performance.now();
        for (let i = 0; i < count || performance.now() - start < minMs; i++) {
          ar.process(frame);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      };

      // Long enough for several detection passes on every build, had they not been gated.
      const GATED_WINDOW_MS = 2_000;

      /**
       * Get pinball tracked and kuva not, then keep pushing the pinball-only frame for a
       * while. The extra frames let the threaded build collect any search it started on
       * an earlier two-marker frame, and they run detection on the pinball-only frame
       * under whatever policy is set.
       */
      const holdPinballAlone = async () => {
        const pinballAlone = () => isFound(ar, 0) && !isFound(ar, 1);
        await processUntil(ar, frames.pinballOnly, pinballAlone);
        await processFrames(frames.pinballOnly, 10, 1_000);
        await processUntil(ar, frames.pinballOnly, pinballAlone);
      };

      it("picks up a marker that enters while another is held", async () => {
        restoreDetectionDefaults();
        const lost: number[] = [];
        const onLost = (e: any) => lost.push(e.data.index);
        try {
          await processUntil(ar, frames.pinballOnly, () => isFound(ar, 0) && !isFound(ar, 1));

          ar.addEventListener("lostNFTMarker", onLost);
          await processUntil(ar, frames.both, () => isFound(ar, 1));

          expect(lost).not.toContain(0);
          expect(isFound(ar, 0)).toBe(true);
          expect(isFound(ar, 1)).toBe(true);
        } finally {
          ar.removeEventListener("lostNFTMarker", onLost);
          restoreDetectionDefaults();
        }
      });

      it("stops detecting once a marker is tracked when continuous detection is off", async () => {
        try {
          ar.setContinuousDetection(false);
          await holdPinballAlone();

          await processFrames(frames.both, 20, GATED_WINDOW_MS);
          expect(isFound(ar, 0)).toBe(true);
          expect(isFound(ar, 1)).toBe(false);

          ar.setContinuousDetection(true);
          await processUntil(ar, frames.both, () => isFound(ar, 1));
          expect(isFound(ar, 1)).toBe(true);
        } finally {
          restoreDetectionDefaults();
        }
      });

      it("detects at most once per detection interval while a marker is tracked", async () => {
        try {
          // Hold pinball alone with detection on every frame, so a pass has just run
          // however long ago the previous test last detected; then widen the interval.
          ar.setDetectionInterval(0);
          await holdPinballAlone();
          ar.setDetectionInterval(60_000);

          await processFrames(frames.both, 20, GATED_WINDOW_MS);
          expect(isFound(ar, 0)).toBe(true);
          expect(isFound(ar, 1)).toBe(false);

          ar.setDetectionInterval(0);
          await processUntil(ar, frames.both, () => isFound(ar, 1));
          expect(isFound(ar, 1)).toBe(true);
        } finally {
          restoreDetectionDefaults();
        }
      });

      it("leaves tracking-only frames after every detection pass, however long a pass takes", async () => {
        try {
          // An interval far shorter than a detection pass (~320 ms at 2000x1500). Counted
          // from the start of a pass, every frame would detect again; counted from its
          // end, tracking-only frames follow each pass. (On the threaded build detection
          // runs off the main thread, so its frames are tracking-only either way.)
          ar.setDetectionInterval(50);
          await holdPinballAlone();

          const frameMs: number[] = [];
          for (let i = 0; i < 30; i++) {
            const start = performance.now();
            ar.process(frames.pinballOnly);
            frameMs.push(performance.now() - start);
            await new Promise((resolve) => setTimeout(resolve, 5));
          }

          expect(isFound(ar, 0)).toBe(true);
          // A tracking-only frame takes ~10 ms here; a frame with a detection pass, ~320 ms.
          const trackingOnly = frameMs.filter((ms) => ms < 100).length;
          expect(trackingOnly).toBeGreaterThanOrEqual(10);
        } finally {
          restoreDetectionDefaults();
        }
      });
    });
  }
}

describe("test page isolation", () => {
  it("is cross-origin isolated, so the threaded build can use SharedArrayBuffer", () => {
    expect(globalThis.crossOriginIsolated).toBe(true);
  });
});
