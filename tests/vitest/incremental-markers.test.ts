import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ARControllerNFT } from "../../src/index";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  blankFrame,
  loadMarker,
} from "./helpers";

/**
 * Incremental marker loading — #612.
 *
 * SKIPPED: these describe the intended behaviour, which the library does not
 * yet have. Un-skip them in the PR that fixes #612; passing is the proof.
 *
 * The defect: `addNFTMarkers()` derives page numbers, marker ids and surfaceSet
 * indices from its loop counter, which restarts at 0 on every call. A second
 * call therefore collides with the markers loaded by the first. There are five
 * copies of this function (four C++ targets plus the Python binding), all
 * carrying it.
 *
 * Partially fixed already: offsetting those indices by the running
 * `surfaceSetCount` is done and verified — the native log reports
 * "Assigned page no. 1." on the second call where it used to report 0.
 *
 * Still failing: `kpmSetRefDataSet()` is not idempotent. In the BINARY_FEATURE
 * path this build uses, it appends every page to `kpmHandle->freakMatcher` via
 * `addFreakFeaturesAndDescriptors()` and never clears the matcher, so a second
 * call re-adds pages that are already present and throws. Retaining the
 * accumulated reference dataset is necessary but not sufficient; the matcher
 * state has to be rebuilt too — probably by recreating the handle through
 * `createKpmHandle()` before setting the accumulated set.
 *
 * Note the failure shape: the native exception surfaces inside an XHR callback,
 * so `loadNFTMarker` never calls back at all. Without the timeout in
 * `loadMarker()` these would hang rather than fail.
 */
describe.skip("incremental addNFTMarkers (#612)", () => {
  let ar: any;

  beforeAll(async () => {
    ar = await ARControllerNFT.initWithDimensions(
      VIDEO_WIDTH,
      VIDEO_HEIGHT,
      CAMERA_PARAM,
      true,
    );
  });

  afterAll(() => {
    ar?.dispose?.();
  });

  it("assigns id 0 to the first marker", async () => {
    const id = await loadMarker(ar, MARKER_PINBALL);
    expect(id).toBe(0);
  });

  it("assigns id 1 to a marker loaded in a second call", async () => {
    const id = await loadMarker(ar, MARKER_KUVA);
    expect(id).toBe(1);
  });

  it("counts both markers", () => {
    expect(ar.nftMarkerCount).toBe(2);
  });

  it("keeps the first marker loaded after the second call", () => {
    // The first marker's surface set must survive: the original defect wrote
    // surfaceSet[0] a second time, leaking and invalidating it while in use.
    const first = ar.getNFTData(ar.id, 0);
    expect(first).toBeTruthy();
    expect(first.width).toBeGreaterThan(0);
  });

  it("exposes data for the second marker", () => {
    const second = ar.getNFTData(ar.id, 1);
    expect(second).toBeTruthy();
    expect(second.width).toBeGreaterThan(0);
  });

  it("still processes frames after the second load", () => {
    // Previously this crashed: surfaceSet[0] had been replaced while
    // process()/trackNFTMarkerId(0) were using it.
    expect(() => ar.process(blankFrame())).not.toThrow();
  });

  it("continues the sequence for a third marker", async () => {
    const id = await loadMarker(ar, MARKER_PINBALL);
    expect(id).toBe(2);
  });
});
