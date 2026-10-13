/**
 * checkExercised in tools/compare-builds/scenarios.js, on synthetic records: the guard
 * that keeps tools/compare-builds.js from reporting "identical" for records that do not
 * show tracking at work, including the losses before the re-detection in bothAgain.
 *
 * Run with `npm run test:node`.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PHASES,
  checkExercised,
} = require("../../tools/compare-builds/scenarios.js");

const RUN = "filtering off, continuous on, interval 0";
const PINBALL = 0;
const KUVA = 1;

/** One run's records, two markers, with `found(phase, marker)` deciding each state. */
function records(found) {
  const out = [];
  for (const phase of PHASES) {
    for (let frame = 0; frame < phase.count; frame++) {
      out.push({
        scenario: `${phase.name} [${RUN}]`,
        frame,
        ret: 0,
        markers: [PINBALL, KUVA].map((marker) => ({
          found: found(phase.name, marker),
          error: 0,
          pose: [],
        })),
      });
    }
  }
  return out;
}

/** What the phases are meant to show: kuva lost in pinballOnly, both lost in blank. */
function expected(phase, marker) {
  if (phase === "blank") return false;
  if (phase === "pinballOnly") return marker === PINBALL;
  return true;
}

describe("checkExercised", () => {
  it("accepts records in which the phases show what they are meant to", () => {
    const coverage = checkExercised(records(expected));
    assert.deepEqual(coverage.problems, []);
    assert.equal(coverage.ok, true);
  });

  it("rejects records in which no marker is lost in pinballOnly", () => {
    const coverage = checkExercised(
      records(
        (phase, marker) => phase === "pinballOnly" || expected(phase, marker),
      ),
    );
    assert.equal(coverage.ok, false);
    assert.deepEqual(coverage.problems, [
      `pinballOnly [${RUN}]: no marker lost`,
    ]);
  });

  it("rejects records in which no marker is found in pinballOnly", () => {
    const coverage = checkExercised(
      records(
        (phase, marker) => phase !== "pinballOnly" && expected(phase, marker),
      ),
    );
    assert.equal(coverage.ok, false);
    assert.deepEqual(coverage.problems, [
      `pinballOnly [${RUN}]: no marker found`,
    ]);
  });

  it("rejects records in which a marker is not lost in blank", () => {
    const coverage = checkExercised(
      records((phase, marker) =>
        phase === "blank" ? marker === KUVA : expected(phase, marker),
      ),
    );
    assert.equal(coverage.ok, false);
    assert.deepEqual(coverage.problems, [
      `blank [${RUN}]: marker ${KUVA} never lost`,
    ]);
  });
});
