import { describe, it, expect } from "vitest";
import {
  selectBuild,
  supportsWasmSimd,
  WORKER_FILES,
} from "../../src/tracker/worker/selectBuild";

/**
 * createNFTTrackerWorker's build choice (#720 D4): td when the page is cross-origin
 * isolated, otherwise simd when WASM SIMD validates, otherwise default. `opts.build`
 * overrides it. The environment is passed in, so each branch is tested without stubbing
 * the browser's globals.
 */
describe("selectBuild", () => {
  it("auto picks td when cross-origin isolated", () => {
    expect(selectBuild("auto", { crossOriginIsolated: true, simd: true })).toBe(
      "td",
    );
  });

  it("auto picks simd when not isolated but SIMD is supported", () => {
    expect(
      selectBuild("auto", { crossOriginIsolated: false, simd: true }),
    ).toBe("simd");
  });

  it("auto picks default with neither", () => {
    expect(
      selectBuild("auto", { crossOriginIsolated: false, simd: false }),
    ).toBe("default");
  });

  it("an explicit build wins whatever the environment", () => {
    const envs = [
      { crossOriginIsolated: true, simd: true },
      { crossOriginIsolated: false, simd: true },
      { crossOriginIsolated: false, simd: false },
    ];
    for (const env of envs) {
      for (const build of ["default", "simd", "td"] as const) {
        expect(selectBuild(build, env)).toBe(build);
      }
    }
  });

  it("names one worker file per build", () => {
    expect(WORKER_FILES).toEqual({
      default: "NFTTracker.worker.js",
      simd: "NFTTracker_simd.worker.js",
      td: "NFTTracker_td.worker.js",
    });
  });
});

describe("supportsWasmSimd", () => {
  it("is true in the suite's Chromium", () => {
    expect(supportsWasmSimd()).toBe(true);
  });
});
