#!/usr/bin/env node
/**
 * Compares the tracking output of two builds of the library.
 *
 * It plays the frame sequences of tools/compare-builds/scenarios.js through both builds
 * and compares, per frame, the return value of detectNFTMarker() and, per marker, found,
 * error and the 12 pose values. It is the check that a refactor of the bindings changed
 * no behaviour (refs #683).
 *
 * Node bundles, run in this process:
 *
 *   node tools/compare-builds.js [--self-test] <oldNodeBundle> <newNodeBundle>
 *
 *   --self-test  runs the new side with filtering inverted in every run, to prove the
 *                tool reports a difference.
 *
 * Browser bundles, run in headless Chromium through tools/compare-builds/index.html:
 *
 *   node tools/compare-builds.js --browser [--threaded] <oldBundleUrl> <newBundleUrl>
 *
 *   URLs are paths on python-server.py, which serves the repository root on port 8091,
 *   for example /dist/ARToolkitNFT.js. --threaded compares only the found set and the
 *   pose of the last frame of each scenario (see scenarios.js); use it for
 *   ARToolkitNFT_td.js, whose 602.ARToolkitNFT_td.js chunk must sit next to it. A Node or
 *   single-thread browser comparison takes a minute or two, a threaded one about five.
 *
 * The reference builds come from git, kept in tools/compare-builds/ref/ (ignored by git and
 * served by python-server.py), one file at a time:
 *
 *   git show origin/dev:dist/ARToolkitNFT_node.js > tools/compare-builds/ref/ARToolkitNFT_node.js
 *
 * Prints "identical (<n> records)" and exits 0, or prints the first differing record
 * and exits 1. Exits 2 on a usage or run error.
 */
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  runScenarios,
  compareRecords,
  WIDTH,
  HEIGHT,
  KUVA_PRINT,
  KUVA_FILL,
  BLANK_GREY,
} = require("./compare-builds/scenarios.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const EXAMPLE_DIR = path.join(REPO_ROOT, "examples", "node");
const PORT = 8091;

const USAGE =
  "usage: node tools/compare-builds.js [--self-test] <oldNodeBundle> <newNodeBundle>\n" +
  "       node tools/compare-builds.js --browser [--threaded] <oldBundleUrl> <newBundleUrl>";

/** The frames of tests/node/multi-marker.test.js, plus a flat grey one. */
async function loadNodeFrames() {
  const sharp = require("sharp");
  const photo = path.join(EXAMPLE_DIR, "pinball-demo.jpg");
  const both = await sharp(photo).ensureAlpha().raw().toBuffer();
  const mask = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      `<polygon points="${KUVA_PRINT}" fill="${KUVA_FILL}"/></svg>`,
  );
  const pinballOnly = await sharp(photo)
    .composite([{ input: mask, top: 0, left: 0 }])
    .ensureAlpha()
    .raw()
    .toBuffer();
  const blank = new Uint8Array(WIDTH * HEIGHT * 4).fill(BLANK_GREY);
  for (let i = 3; i < blank.length; i += 4) blank[i] = 255;
  return {
    both: new Uint8Array(both.buffer, both.byteOffset, both.length),
    pinballOnly: new Uint8Array(
      pinballOnly.buffer,
      pinballOnly.byteOffset,
      pinballOnly.length,
    ),
    blank,
  };
}

async function compareNode(oldBundle, newBundle, selfTest) {
  const oldPath = path.resolve(oldBundle);
  const newPath = path.resolve(newBundle);
  const frames = await loadNodeFrames();

  // The library resolves the camera and marker paths against the working directory.
  process.chdir(EXAMPLE_DIR);
  const options = {
    cameraUrl: "camera_para.dat",
    markerUrls: ["DataNFT/pinball", "DataNFT/kuva"],
  };

  const oldRecords = await quietly(() =>
    runScenarios(loadFresh(oldPath).ARControllerNFT, frames, options),
  );
  const newRecords = await quietly(() =>
    runScenarios(loadFresh(newPath).ARControllerNFT, frames, {
      ...options,
      invertFiltering: selfTest,
    }),
  );
  return compareRecords(oldRecords, newRecords);
}

/**
 * Requires a bundle as a new module instance, even when the same file was required before:
 * the library keeps state across controllers (AR2's rand() sequence), so each side must
 * start from a freshly loaded module.
 */
function loadFresh(bundlePath) {
  delete require.cache[require.resolve(bundlePath)];
  return require(bundlePath);
}

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

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk;
      if (output.includes("Serving on port")) resolve();
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", (chunk) => (output += chunk));
    server.on("error", reject);
    server.on("exit", (code) =>
      reject(new Error(`python-server.py exited with ${code}:\n${output}`)),
    );
  });
}

async function compareBrowser(oldUrl, newUrl, threaded) {
  const { chromium } = require("playwright");
  // -u: unbuffered, so "Serving on port" reaches us as soon as the server listens.
  const server = spawn("python", ["-u", "python-server.py", String(PORT)], {
    cwd: REPO_ROOT,
  });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", (error) =>
      console.error(`page error: ${error.message}`),
    );
    // Failed requests are reported from the responses, which carry the URL: the browser
    // loader asks for <marker>.zft before the .fset/.iset/.fset3 files, so that 404 is
    // expected and left out.
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith(".zft")) {
        console.error(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        !text.startsWith("Failed to load resource")
      ) {
        console.error(`console: ${text}`);
      }
    });
    const query = new URLSearchParams({
      old: oldUrl,
      new: newUrl,
      threaded: threaded ? "1" : "0",
    });
    await page.goto(
      `http://localhost:${PORT}/tools/compare-builds/index.html?${query}`,
    );
    await page.waitForFunction(() => window.result !== undefined, null, {
      timeout: 0,
      polling: 1000,
    });
    const result = await page.evaluate(() => window.result);
    if (result.error) throw new Error(`the page failed: ${result.error}`);
    return result;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

function report(result) {
  if (result.identical) {
    console.log(`identical (${result.compared} records)`);
    return 0;
  }
  const first = result.diffs[0];
  console.log(
    `different: ${result.diffs.length} of ${result.compared} records differ`,
  );
  console.log(`first difference at #${first.index}, field ${first.field}`);
  console.log(`old: ${JSON.stringify(first.old)}`);
  console.log(`new: ${JSON.stringify(first.new)}`);
  const LISTED = 30;
  console.log(
    `differences${result.diffs.length > LISTED ? ` (first ${LISTED})` : ""}:`,
  );
  for (const diff of result.diffs.slice(0, LISTED)) {
    const record = diff.old || diff.new;
    console.log(
      `  #${diff.index} ${record.scenario} frame ${record.frame}: ${diff.field}`,
    );
  }
  return 1;
}

async function main(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const operands = argv.filter((arg) => !arg.startsWith("--"));
  const known = new Set(["--self-test", "--browser", "--threaded"]);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  const browser = flags.has("--browser");
  if (
    operands.length !== 2 ||
    unknown.length > 0 ||
    (browser && flags.has("--self-test")) ||
    (!browser && flags.has("--threaded"))
  ) {
    console.error(USAGE);
    return 2;
  }

  const [oldBuild, newBuild] = operands;
  if (browser) {
    const notServerPath = operands.find((url) => !url.startsWith("/"));
    if (notServerPath) {
      // Git Bash rewrites "/dist/x.js" into "C:/Program Files/Git/dist/x.js".
      console.error(
        `${notServerPath}: expected a path on the server, such as /dist/ARToolkitNFT.js ` +
          "(in Git Bash, set MSYS_NO_PATHCONV=1)",
      );
      return 2;
    }
    return report(
      await compareBrowser(oldBuild, newBuild, flags.has("--threaded")),
    );
  }
  return report(
    await compareNode(oldBuild, newBuild, flags.has("--self-test")),
  );
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(2);
  },
);
