/**
 * Frame sequences for tools/compare-builds.js, and the comparison of their output.
 *
 * Plain script: `require()` it from Node, or load it with a `<script>` tag (it then sets
 * `self.CompareBuilds`). It never touches the library's internals: it drives a build only
 * through the public ARControllerNFT API, so the same sequences run against any two builds.
 *
 * Runs. Each run starts a fresh controller, loads pinball and kuva, sets filtering,
 * continuous detection and the detection interval, then plays four phases on that one
 * controller, in order:
 *
 *   both         20 frames  both prints in view
 *   pinballOnly  20 frames  kuva painted over (kuva's tracking is lost)
 *   blank         5 frames  flat grey (all tracking is lost)
 *   bothAgain    20 frames  both prints again (re-detection)
 *
 * The phases share the controller on purpose: "bothAgain" is only a re-detection after the
 * losses before it. A record's `scenario` names the phase and the run, for example
 * "pinballOnly [filtering on, continuous off, interval 0]", and `frame` counts from 0 within
 * the phase. There are five runs: filtering on and off times continuous detection on and off,
 * all with interval 0, plus one with interval 60000 (filtering off, continuous on). Both
 * intervals make the result independent of the machine's speed: 0 detects whenever detection
 * is allowed, 60000 does not detect while a marker is tracked, as long as a run takes less
 * than a minute.
 *
 * Record: `{ scenario, frame, ret, markers: [{ found, error, pose }] }`, one per frame, with
 * one marker entry per loaded marker in id order and `pose` the 12 values of
 * `getNFTMarker(i).pose`. `ret` is the return value of `detectNFTMarker()` on that frame:
 * `process()` returns nothing, but it calls `this.detectNFTMarker()`, so the run wraps that
 * method on the controller instance to observe it.
 *
 * Wall clock. AR2's template selection (ar2SelectTemplate in WebARKitLib's
 * lib/SRC/AR2/selectTemplate.c) reseeds rand() with time(NULL) every 128 calls, so even a
 * single-thread build tracks differently from one run to the next: two runs of the same
 * bundle differ in the first frame's pose. runScenarios therefore freezes Date.now (which
 * Emscripten's time() reads) in the build's realm while it runs. The rand() sequence then
 * depends only on the order of the library's own calls, which is what must not change.
 * performance.now(), which the detection interval reads, is left alone.
 *
 * Threaded builds. The detection search runs on a worker, and its result is collected on
 * the first frame after it finishes, so the frame on which a marker is found depends on
 * timing. The pose never settles on static frames: it changes a little on every frame, so
 * the pose on a scenario's last frame depends on how many frames the marker has been
 * tracked. Two measures make the threaded run repeatable:
 *
 * - `searchWait`: after a frame on which any marker is not found, the run waits this long
 *   before the next frame, longer than a search takes. A search only starts on such a frame
 *   (it needs an untracked marker, and tracking can be lost within a frame but not gained),
 *   so every search is collected on the very next frame, whatever the machine's speed.
 *   After a frame on which every marker is found, the run waits `settle` only.
 * - With `threaded: true`, compareRecords compares only the last frame of each scenario: the
 *   set of markers found and the 12 pose values of each marker.
 *
 * Stability, measured on ARToolkitNFT_td.js from origin/dev against itself (2026-10-09):
 * waiting 20 ms after every frame, 12 of the 20 scenarios differed in the last frame's pose
 * (every scenario in which a marker is tracked; the found sets always matched). With
 * `searchWait` (1000 ms in index.html), three runs were identical on all 20 scenarios, and a
 * frame-by-frame comparison of all 325 records matched too. No scenario is narrowed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CompareBuilds = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WIDTH = 2000;
  const HEIGHT = 1500;

  /** Corners of the kuva print in pinball-demo.jpg, as in tests/node/multi-marker.test.js. */
  const KUVA_PRINT = "1128,380 1705,452 1705,1165 1096,1100";
  const KUVA_FILL = "#d9d4ca";

  /** Grey level of every RGB channel of the blank frame (alpha is 255). */
  const BLANK_GREY = 128;

  /** What Date.now() returns while the scenarios run: 2026-01-01T00:00:00Z. */
  const FROZEN_NOW = Date.UTC(2026, 0, 1);

  const PHASES = [
    { name: "both", frame: "both", count: 20 },
    { name: "pinballOnly", frame: "pinballOnly", count: 20 },
    { name: "blank", frame: "blank", count: 5 },
    { name: "bothAgain", frame: "both", count: 20 },
  ];

  const RUNS = [
    { filtering: false, continuous: true, interval: 0 },
    { filtering: true, continuous: true, interval: 0 },
    { filtering: false, continuous: false, interval: 0 },
    { filtering: true, continuous: false, interval: 0 },
    { filtering: false, continuous: true, interval: 60000 },
  ];

  function runLabel(run) {
    return (
      `filtering ${run.filtering ? "on" : "off"}, ` +
      `continuous ${run.continuous ? "on" : "off"}, ` +
      `interval ${run.interval}`
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadMarkers(ar, urls, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`loadNFTMarkers(${urls}) timed out`)),
        timeoutMs,
      );
      ar.loadNFTMarkers(
        urls,
        (ids) => {
          clearTimeout(timer);
          resolve(ids);
        },
        (err) => {
          clearTimeout(timer);
          reject(new Error(`loadNFTMarkers(${urls}) failed: ${err}`));
        },
      );
    });
  }

  function snapshot(info) {
    return {
      found: info.found,
      error: info.error,
      pose: Array.from(info.pose),
    };
  }

  /**
   * Plays every run against one build.
   *
   * @param ARControllerNFT the build's controller class.
   * @param frames `{ both, pinballOnly, blank }`, each a frame as that build's `process()`
   *   takes it: an RGBA Uint8Array of 2000 x 1500 for the Node build, an ImageData (or any
   *   `{ data }`) for the browser builds.
   * @param options `{ cameraUrl, markerUrls, settle, searchWait, invertFiltering, wallClock }`.
   *   `settle` is the number of milliseconds to wait after a frame on which every marker is
   *   found, `searchWait` after a frame on which one is not (both default to 0; see the
   *   header for the threaded build). `invertFiltering` turns filtering off where a run asks
   *   for it on and the reverse, to prove the comparison sees a difference; the records keep
   *   the run's nominal label. `wallClock` is the `Date` of the realm the build runs in
   *   (default: this realm's), whose `now` is frozen during the run (see the header).
   * @return a Promise of the records, in play order.
   */
  async function runScenarios(ARControllerNFT, frames, options) {
    const wallClock = options.wallClock || Date;
    const now = wallClock.now;
    wallClock.now = () => FROZEN_NOW;
    try {
      return await playRuns(ARControllerNFT, frames, options);
    } finally {
      wallClock.now = now;
    }
  }

  async function playRuns(ARControllerNFT, frames, options) {
    const {
      cameraUrl,
      markerUrls,
      settle = 0,
      searchWait = 0,
      invertFiltering = false,
    } = options;
    const records = [];

    for (const run of RUNS) {
      const ar = await ARControllerNFT.initWithDimensions(
        WIDTH,
        HEIGHT,
        cameraUrl,
      );
      const ids = await loadMarkers(ar, markerUrls);
      ids.forEach((id) => ar.trackNFTMarkerId(id));

      ar.setFiltering(invertFiltering ? !run.filtering : run.filtering);
      ar.setContinuousDetection(run.continuous);
      ar.setDetectionInterval(run.interval);

      let ret = null;
      const detectNFTMarker = ar.detectNFTMarker;
      ar.detectNFTMarker = function () {
        ret = detectNFTMarker.call(this);
        return ret;
      };

      for (const phase of PHASES) {
        const scenario = `${phase.name} [${runLabel(run)}]`;
        for (let frame = 0; frame < phase.count; frame++) {
          ret = null;
          ar.process(frames[phase.frame]);
          const markers = ids.map((id) => snapshot(ar.getNFTMarker(id)));
          records.push({ scenario, frame, ret, markers });
          const wait = markers.every((m) => m.found) ? settle : searchWait;
          if (wait > 0) await sleep(wait);
        }
      }
    }

    return records;
  }

  function samePose(a, b) {
    return (
      a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
    );
  }

  /** The first field in which two records differ, or null. Numbers compare exactly. */
  function recordDifference(a, b) {
    if (a.scenario !== b.scenario || a.frame !== b.frame) {
      return "scenario/frame";
    }
    if (!Object.is(a.ret, b.ret)) return "ret";
    if (a.markers.length !== b.markers.length) return "markers.length";
    for (let i = 0; i < a.markers.length; i++) {
      const ma = a.markers[i];
      const mb = b.markers[i];
      if (!Object.is(ma.found, mb.found)) return `markers[${i}].found`;
      if (!Object.is(ma.error, mb.error)) return `markers[${i}].error`;
      if (!samePose(ma.pose, mb.pose)) return `markers[${i}].pose`;
    }
    return null;
  }

  function lastOfEachScenario(records) {
    const last = new Map();
    for (const record of records) last.set(record.scenario, record);
    return last;
  }

  function foundSet(record) {
    return record.markers
      .map((m, i) => (m.found ? i : -1))
      .filter((i) => i >= 0);
  }

  /** The threaded criterion's difference for one scenario's last frame, or null. */
  function threadedDifference(a, b) {
    const foundA = foundSet(a);
    const foundB = foundSet(b);
    if (foundA.join() !== foundB.join()) return "found set";
    for (let i = 0; i < a.markers.length; i++) {
      if (!samePose(a.markers[i].pose, b.markers[i].pose)) {
        return `markers[${i}].pose`;
      }
    }
    return null;
  }

  /**
   * Compares two builds' records.
   *
   * @return `{ identical, compared, diffs }`, with `compared` the number of records (or of
   *   scenarios, with `threaded`) compared and `diffs` a list of
   *   `{ index, field, old, new }` in play order.
   */
  function compareRecords(oldRecords, newRecords, { threaded = false } = {}) {
    const diffs = [];

    if (threaded) {
      const oldLast = lastOfEachScenario(oldRecords);
      const newLast = lastOfEachScenario(newRecords);
      let index = 0;
      for (const [scenario, a] of oldLast) {
        const b = newLast.get(scenario);
        const field = b ? threadedDifference(a, b) : "missing scenario";
        if (field) diffs.push({ index, field, old: a, new: b || null });
        index++;
      }
      for (const [scenario, b] of newLast) {
        if (!oldLast.has(scenario)) {
          diffs.push({
            index: index++,
            field: "extra scenario",
            old: null,
            new: b,
          });
        }
      }
      return { identical: diffs.length === 0, compared: oldLast.size, diffs };
    }

    const n = Math.max(oldRecords.length, newRecords.length);
    for (let index = 0; index < n; index++) {
      const a = oldRecords[index];
      const b = newRecords[index];
      const field = a && b ? recordDifference(a, b) : "missing record";
      if (field) diffs.push({ index, field, old: a || null, new: b || null });
    }
    return { identical: diffs.length === 0, compared: n, diffs };
  }

  return {
    WIDTH,
    HEIGHT,
    KUVA_PRINT,
    KUVA_FILL,
    BLANK_GREY,
    PHASES,
    RUNS,
    runScenarios,
    compareRecords,
  };
});
