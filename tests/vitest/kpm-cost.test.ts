import { describe, it, expect } from "vitest";
import { CAMERA_PARAM, MARKER_PINBALL, MARKER_KUVA, loadMarkers } from "./helpers";
import { loadCompositeFrames, isFound, processUntil } from "./frames";
import { VARIANTS } from "./variants";

/**
 * Cost of detection (KPM) per `process()` at camera-like frame sizes, on the default build.
 *
 * NOT part of the regular suite: it measures, it does not assert behaviour, and it takes a
 * few minutes. To run it, temporarily change `describe.skip` below to `describe`, then:
 *
 *   npx vitest run tests/vitest/kpm-cost.test.ts
 *
 * and read the `[kpm-cost]` lines from the console. Results for 2026-09-23 are recorded in
 * `specs/2026-09-22-multi-nft-marker-design.md` ("Detection cost at camera sizes").
 *
 * For each frame size it loads `[pinball]` and `[pinball, kuva]`, gets pinball tracked in the
 * pinball-only frame (kuva painted out, so kuva stays loaded but unseen), then times 60
 * `process()` calls under two policies:
 *  (a) `setDetectionInterval(0)`: a detection pass on every frame while kuva is unseen;
 *  (b) the build's defaults (continuous detection, 300 ms interval).
 * Frames are paced at ~30 fps, like a camera, because policy (b) is measured in time.
 */
// 320x240, 340x255 and 640x480. At 320x240 pinball is too small in the photo to be detected
// (2026-09-23), so 340x255, the smallest scale where it is, stands in for it.
const SCALES = [0.16, 0.17, 0.32];
const FRAMES = 60;
const FRAME_PERIOD_MS = 1000 / 30;

const variant = VARIANTS.find((v) => v.name === "wasm")!;

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { median: pick(0.5), p90: pick(0.9), max: sorted[sorted.length - 1] };
}

describe.skip("KPM cost at camera sizes (manual harness)", () => {
  for (const scale of SCALES) {
    for (const markers of [[MARKER_PINBALL], [MARKER_PINBALL, MARKER_KUVA]]) {
      it(`scale ${scale}, loaded ${markers.length} marker(s)`, async () => {
        const { ARControllerNFT } = await variant.load();
        const frames = await loadCompositeFrames(scale);
        const ar = await ARControllerNFT.initWithDimensions(
          frames.width,
          frames.height,
          CAMERA_PARAM,
          true,
        );
        const ids = await loadMarkers(ar, markers);
        ids.forEach((id: number) => ar.trackNFTMarkerId(id));

        const size = `${frames.width}x${frames.height}`;
        const loaded = markers.map((m) => m.split("/").pop()).join(",");

        try {
          await processUntil(ar, frames.pinballOnly, () => isFound(ar, 0), 200);
        } catch {
          console.log(`[kpm-cost] ${size} loaded=[${loaded}] pinball NOT found in 200 frames`);
          return;
        }

        const policies: [string, () => void][] = [
          ["interval=0", () => ar.setDetectionInterval(0)],
          [
            `defaults (interval=${variant.detectionIntervalMs})`,
            () => {
              ar.setContinuousDetection(true);
              ar.setDetectionInterval(variant.detectionIntervalMs);
            },
          ],
        ];

        for (const [label, apply] of policies) {
          apply();
          await processUntil(ar, frames.pinballOnly, () => isFound(ar, 0), 200);

          const samples: number[] = [];
          let lostPinball = 0;
          for (let i = 0; i < FRAMES; i++) {
            const start = performance.now();
            ar.process(frames.pinballOnly);
            const elapsed = performance.now() - start;
            samples.push(elapsed);
            if (!isFound(ar, 0)) lostPinball++;
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(1, FRAME_PERIOD_MS - elapsed)),
            );
          }
          const s = stats(samples);
          console.log(
            `[kpm-cost] ${size} loaded=[${loaded}] ${label}: ` +
              `median=${s.median.toFixed(1)}ms p90=${s.p90.toFixed(1)}ms max=${s.max.toFixed(1)}ms ` +
              `(n=${FRAMES}, frames without pinball=${lostPinball})`,
          );
          expect(samples.length).toBe(FRAMES);
        }
      }, 300_000);
    }
  }
});
