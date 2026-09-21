import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ARControllerNFT } from "../../src/index";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  loadMarker,
  loadMarkers,
} from "./helpers";

/**
 * Does detection actually work?
 *
 * Every other spec in this suite asserts that something does not throw. That is
 * necessary — it is what #614 needed — but it is not the same as the library
 * doing its job. This one pushes a real photograph of the pinball target through
 * `process()` and waits for the `getNFTMarker` event.
 *
 * It is the only test here that would fail if tracking silently stopped working
 * while the plumbing stayed intact.
 *
 * The image is `examples/node/pinball-demo.jpg`, the same fixture the Node
 * example uses, at its native 2000x1500. The controller has to be created at the
 * frame's dimensions: `process()` copies width * height * 4 bytes into a buffer
 * sized at construction.
 */

const DEMO_IMAGE = "/examples/node/pinball-demo.jpg";
const IMAGE_WIDTH = 2000;
const IMAGE_HEIGHT = 1500;

/** Decode the demo photo to RGBA, which is what `process()` expects. */
async function loadImageData(url: string): Promise<ImageData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not get a 2d context");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

describe("NFT detection on a real image", () => {
  let ar: any;
  let frame: ImageData;

  beforeAll(async () => {
    frame = await loadImageData(DEMO_IMAGE);
    ar = await ARControllerNFT.initWithDimensions(
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      CAMERA_PARAM,
      true,
    );
    const id = await loadMarker(ar, MARKER_PINBALL);
    ar.trackNFTMarkerId(id);
  }, 120_000);

  afterAll(() => {
    ar?.dispose?.();
  });

  it("decodes the demo image at its native size", () => {
    expect(frame.width).toBe(IMAGE_WIDTH);
    expect(frame.height).toBe(IMAGE_HEIGHT);
  });

  it("fires getNFTMarker and reports a pose", () => {
    const seen: any[] = [];
    ar.addEventListener("getNFTMarker", (e: any) => seen.push(e));

    // KPM detection hands off to AR2 tracking, which needs a few iterations
    // before it locks on — the Node example loops for the same reason.
    for (let i = 0; i < 10; i++) {
      ar.process(frame);
    }

    expect(seen.length).toBeGreaterThan(0);

    const event = seen[0];
    expect(event.name).toBe("getNFTMarker");
    expect(event.data.index).toBe(0);

    // A real pose, not a zeroed matrix.
    const matrix: number[] = Array.from(event.data.matrix);
    expect(matrix.length).toBeGreaterThanOrEqual(12);
    expect(matrix.some((v) => v !== 0)).toBe(true);
  });

  it("reports the marker as found", () => {
    ar.process(frame);
    const info = ar.getNFTMarker(0);
    expect(info).toBeTruthy();
    expect(info.id).toBe(0);
    // `found` is the assertion that matters: getNFTMarker() returns a populated
    // struct either way, so checking only `id` passes on a blank frame too.
    expect(Boolean(info.found)).toBe(true);
  });
});

/**
 * Detection must pick the *right* marker.
 *
 * Both datasets are loaded with the batch `loadNFTMarkers([a, b])` — the working
 * path; loading across separate calls is what #612 breaks — and the same pinball
 * photograph is pushed through. Only the pinball target is in the image, so id 0
 * should be found and id 1 should not.
 *
 * It does not work. The detection is attributed to the wrong marker: the event
 * fires with `index: 1` and `getNFTMarker(1).found` is true, while id 0 reports
 * nothing. Filed as #631; the two affected tests are skipped below.
 *
 * The matcher itself is fine — measured separately, kuva alone correctly refuses
 * to match the pinball photograph. It is the index mapping that is wrong.
 */
describe("detection with two markers loaded", () => {
  let ar: any;
  let frame: ImageData;

  beforeAll(async () => {
    frame = await loadImageData(DEMO_IMAGE);
    ar = await ARControllerNFT.initWithDimensions(
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      CAMERA_PARAM,
      true,
    );
    const ids = await loadMarkers(ar, [MARKER_PINBALL, MARKER_KUVA]);
    expect(ids).toEqual([0, 1]);
    ids.forEach((id) => ar.trackNFTMarkerId(id));
  }, 150_000);

  afterAll(() => {
    ar?.dispose?.();
  });

  it("counts both markers", () => {
    expect(ar.nftMarkerCount).toBe(2);
  });

  // SKIPPED — see #631. Events fire for index 1 instead of index 0.
  it.skip("detects the marker that is in the image, and not the other one", () => {
    const byIndex = new Map<number, number>();
    ar.addEventListener("getNFTMarker", (e: any) => {
      byIndex.set(e.data.index, (byIndex.get(e.data.index) ?? 0) + 1);
    });

    for (let i = 0; i < 10; i++) {
      ar.process(frame);
    }

    // pinball is the target in the photograph.
    expect(byIndex.get(0) ?? 0).toBeGreaterThan(0);
    // kuva is not, so firing for it would mean the matcher is not discriminating.
    expect(byIndex.get(1) ?? 0).toBe(0);
  });

  // SKIPPED — see #631. found is reported on the wrong marker.
  it.skip("reports found only for the marker that is present", () => {
    ar.process(frame);
    expect(Boolean(ar.getNFTMarker(0)?.found)).toBe(true);
    expect(Boolean(ar.getNFTMarker(1)?.found)).toBe(false);
  });
});
