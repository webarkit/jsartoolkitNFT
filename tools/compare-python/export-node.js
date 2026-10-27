#!/usr/bin/env node
"use strict";
/**
 * Writes what the Python comparison needs from the Node build, which runs the same
 * ARToolKitNFTCore as the Python binding:
 *
 *   node tools/compare-python/export-node.js <nodeBundle> <outDir>
 *
 * Into <outDir>:
 * - both.rgba, pinballOnly.rgba, blank.rgba: the frames of tools/compare-builds, as raw
 *   2000 x 1500 RGBA bytes decoded by sharp, so that play.py feeds the Python binding
 *   byte-identical frames (another JPEG decoder could give other pixels);
 * - node-records.json: {bundleSha256, records}, the records of runScenarios() for the five
 *   runs of scenarios.js, with the camera, markers and working directory of compareNode()
 *   in tools/compare-builds.js.
 *
 * compare.py then checks that play.py --mode multi finds the same markers on every frame.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { runScenarios } = require("../compare-builds/scenarios.js");
const {
  loadNodeFrames,
  EXAMPLE_DIR,
} = require("../compare-builds/node-frames.js");

const USAGE =
  "usage: node tools/compare-python/export-node.js <nodeBundle> <outDir>";

/** Runs `fn` with the library's per-frame logging silenced; console.error still prints. */
async function quietly(fn) {
  const saved = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    debug: console.debug,
  };
  for (const name of Object.keys(saved)) console[name] = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

async function main(argv) {
  if (argv.length !== 2) {
    console.error(USAGE);
    return 2;
  }
  const bundle = path.resolve(argv[0]);
  const outDir = path.resolve(argv[1]);
  if (!fs.existsSync(bundle)) {
    console.error(`no such bundle: ${bundle}`);
    return 2;
  }
  fs.mkdirSync(outDir, { recursive: true });

  const frames = await loadNodeFrames();
  for (const name of ["both", "pinballOnly", "blank"]) {
    fs.writeFileSync(path.join(outDir, `${name}.rgba`), frames[name]);
  }

  const bundleSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(bundle))
    .digest("hex");
  // The library resolves the camera and marker paths against the working directory.
  process.chdir(EXAMPLE_DIR);
  const { ARControllerNFT } = require(bundle);
  const records = await quietly(() =>
    runScenarios(ARControllerNFT, frames, {
      cameraUrl: "camera_para.dat",
      markerUrls: ["DataNFT/pinball", "DataNFT/kuva"],
    }),
  );
  fs.writeFileSync(
    path.join(outDir, "node-records.json"),
    JSON.stringify({ bundleSha256, records }),
  );
  console.log(
    `wrote 3 frames and ${records.length} records to ${outDir} (bundle sha256 ${bundleSha256})`,
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
