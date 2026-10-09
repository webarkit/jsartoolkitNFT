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
 * Browser bundles, run in headless Chromium through tools/compare-builds/index.html:
 *
 *   node tools/compare-builds.js --browser [--threaded | --self-test] <oldBundleUrl> <newBundleUrl>
 *
 *   URLs are paths on python-server.py, which serves the repository root on port 8091,
 *   for example /dist/ARToolkitNFT.js; the file at the same path under the repository
 *   is the one hashed and checked against what the server sends. --threaded compares only
 *   the found set and the pose of the last frame of each scenario (see scenarios.js); use
 *   it for ARToolkitNFT_td.js, whose 602.ARToolkitNFT_td.js chunk must sit next to it.
 *   The browser builds also play an extra run with the controller's internalLuma option.
 *
 * --self-test runs the new side with filtering inverted in every run, to prove the tool
 * reports a difference. It is refused with --threaded: the threaded build ignores
 * filtering, so the self-test could not show a difference there.
 *
 * The reference builds come from git, kept in tools/compare-builds/ref/ (ignored by git and
 * served by python-server.py), one file at a time:
 *
 *   git show origin/dev:dist/ARToolkitNFT_node.js > tools/compare-builds/ref/ARToolkitNFT_node.js
 *
 * Output. First the sha256 of every file compared, and a WARNING when old and new are
 * byte-identical: such a run checks the tool, not a rewrite. Then "identical (<n> records)"
 * with the number of frames on which the old side found each marker, exit 0; or the first
 * differing record, exit 1. Exit 2, with no verdict, when:
 * - the arguments are wrong, or a bundle file is missing;
 * - a marker does not load, or the old side's records do not show tracking at work (see
 *   checkExercised in scenarios.js), since two builds that track nothing compare identical;
 * - (browser) port 8091 already answers before the server starts, or the server sends a
 *   bundle that differs from the file on disk;
 * - the comparison takes longer than its deadline: 15 minutes for --threaded, 5 otherwise.
 *   A Node or single-thread browser comparison takes a minute or two, a threaded one about
 *   six.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  runScenarios,
  compareRecords,
  checkExercised,
  WIDTH,
  HEIGHT,
  KUVA_PRINT,
  KUVA_FILL,
  BLANK_GREY,
} = require("./compare-builds/scenarios.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const EXAMPLE_DIR = path.join(REPO_ROOT, "examples", "node");
const PORT = 8091;
const MINUTE = 60 * 1000;
const DEADLINE_MINUTES = 5;
const THREADED_DEADLINE_MINUTES = 15;

const USAGE =
  "usage: node tools/compare-builds.js [--self-test] <oldNodeBundle> <newNodeBundle>\n" +
  "       node tools/compare-builds.js --browser [--threaded | --self-test] <oldBundleUrl> <newBundleUrl>";

/** An error whose message says it all: printed without a stack trace. */
function failure(message) {
  return Object.assign(new Error(message), { expected: true });
}

// --- the files compared ------------------------------------------------------------------

/** The files of a Node bundle: just the bundle. */
function nodeBundleFiles(bundle) {
  const file = path.resolve(bundle);
  if (!fs.existsSync(file)) throw failure(`${bundle}: no such file`);
  return [{ name: bundle, file }];
}

/** The files of a browser bundle, by server path: the bundle and, threaded, its chunk. */
function browserBundleFiles(url, threaded) {
  const urls = [url];
  if (threaded) {
    urls.push(`${path.posix.dirname(url)}/602.${path.posix.basename(url)}`);
  }
  return urls.map((u) => {
    const file = path.join(REPO_ROOT, ...decodeURIComponent(u).split("/"));
    if (!file.startsWith(REPO_ROOT + path.sep)) {
      throw failure(`${u}: outside the repository`);
    }
    if (!fs.existsSync(file)) {
      throw failure(`${u}: no such file under the repository (${file})`);
    }
    return { name: u, url: u, file };
  });
}

/** Prints the sha256 of every file, and a WARNING when old and new are byte-identical. */
function describeBuilds(oldFiles, newFiles) {
  const contents = (files) => files.map((f) => fs.readFileSync(f.file));
  const oldBytes = contents(oldFiles);
  const newBytes = contents(newFiles);
  const sha256 = (bytes) =>
    crypto.createHash("sha256").update(bytes).digest("hex");
  oldFiles.forEach((f, i) =>
    console.log(`old ${f.name} sha256 ${sha256(oldBytes[i])}`),
  );
  newFiles.forEach((f, i) =>
    console.log(`new ${f.name} sha256 ${sha256(newBytes[i])}`),
  );
  if (oldBytes.every((bytes, i) => bytes.equals(newBytes[i]))) {
    console.log(
      "WARNING: old and new are byte-identical. This run checks the tool and the scenarios; " +
        "it proves nothing about a rewrite.",
    );
  }
}

// --- deadline ----------------------------------------------------------------------------

function deadlineFailure(minutes) {
  return failure(`the comparison exceeded its deadline of ${minutes} minutes`);
}

/** `work`, or a rejection once `deadlineAt` (a performance.now() value) has passed. */
function withDeadline(work, deadlineAt, minutes) {
  let timer;
  const expired = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(deadlineFailure(minutes)),
      Math.max(0, deadlineAt - performance.now()),
    );
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

// --- Node bundles ------------------------------------------------------------------------

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

async function compareNode(oldFile, newFile, selfTest, deadlineAt) {
  const frames = await loadNodeFrames();

  // The library resolves the camera and marker paths against the working directory.
  process.chdir(EXAMPLE_DIR);
  const options = {
    cameraUrl: "camera_para.dat",
    markerUrls: ["DataNFT/pinball", "DataNFT/kuva"],
    deadline: deadlineAt,
  };

  const oldRecords = await quietly(() =>
    runScenarios(loadFresh(oldFile).ARControllerNFT, frames, options),
  );
  const newRecords = await quietly(() =>
    runScenarios(loadFresh(newFile).ARControllerNFT, frames, {
      ...options,
      invertFiltering: selfTest,
    }),
  );
  const result = compareRecords(oldRecords, newRecords);
  result.coverage = checkExercised(oldRecords);
  return result;
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

// --- browser bundles ---------------------------------------------------------------------

/** Whether something already accepts TCP connections on host:port. */
function accepts(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
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
      reject(failure(`python-server.py exited with ${code}:\n${output}`)),
    );
  });
}

/** Fails unless the server sends each file exactly as it is on disk. */
async function checkServedBytes(files) {
  for (const { url, file } of files) {
    const response = await fetch(`http://localhost:${PORT}${url}`);
    if (!response.ok) {
      throw failure(`the server answered ${response.status} for ${url}`);
    }
    const served = Buffer.from(await response.arrayBuffer());
    if (!served.equals(fs.readFileSync(file))) {
      throw failure(
        `the server sent a different ${url} from ${file}: is another server answering on port ${PORT}?`,
      );
    }
  }
}

async function compareBrowser({
  oldUrl,
  newUrl,
  files,
  threaded,
  selfTest,
  deadlineAt,
  minutes,
}) {
  // On Windows a second python-server.py can bind a port that is already in use, and the
  // browser could then talk to the other one.
  for (const host of ["127.0.0.1", "::1"]) {
    if (await accepts(host, PORT)) {
      throw failure(
        `port ${PORT} already accepts connections on ${host}: stop that server first`,
      );
    }
  }

  const { chromium } = require("playwright");
  // -u: unbuffered, so "Serving on port" reaches us as soon as the server listens.
  const server = spawn("python", ["-u", "python-server.py", String(PORT)], {
    cwd: REPO_ROOT,
  });
  let browser;
  const work = async () => {
    await waitForServer(server);
    await checkServedBytes(files);
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
      selfTest: selfTest ? "1" : "0",
    });
    await page.goto(
      `http://localhost:${PORT}/tools/compare-builds/index.html?${query}`,
    );
    try {
      await page.waitForFunction(() => window.result !== undefined, null, {
        timeout: Math.max(1, deadlineAt - performance.now()),
        polling: 1000,
      });
    } catch (error) {
      throw error.name === "TimeoutError" ? deadlineFailure(minutes) : error;
    }
    const result = await page.evaluate(() => window.result);
    if (result.error) throw failure(`the page failed: ${result.error}`);
    return result;
  };
  try {
    return await withDeadline(work(), deadlineAt, minutes);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      server.kill();
    }
  }
}

// --- verdict -----------------------------------------------------------------------------

function report(result) {
  const { coverage } = result;
  if (!coverage.ok) {
    console.log(
      "not exercised: the old side's records do not show tracking at work, so no verdict:",
    );
    for (const problem of coverage.problems.slice(0, 30))
      console.log(`  ${problem}`);
    return 2;
  }
  const found = coverage.found
    .map((n, i) => `marker ${i} on ${n}/${coverage.frames} frames`)
    .join(", ");
  if (result.identical) {
    console.log(
      `identical (${result.compared} records); the old side found ${found}`,
    );
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
  console.log(`the old side found ${found}`);
  return 1;
}

async function main(argv) {
  const startedAt = performance.now();
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const operands = argv.filter((arg) => !arg.startsWith("--"));
  const known = new Set(["--self-test", "--browser", "--threaded"]);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  const browser = flags.has("--browser");
  const threaded = flags.has("--threaded");
  const selfTest = flags.has("--self-test");
  if (operands.length !== 2 || unknown.length > 0 || (!browser && threaded)) {
    console.error(USAGE);
    return 2;
  }
  if (threaded && selfTest) {
    console.error(
      "--self-test cannot show a difference on the threaded build, which ignores filtering; " +
        "run it on ARToolkitNFT.js or ARToolkitNFT_simd.js",
    );
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
  }

  const minutes = threaded ? THREADED_DEADLINE_MINUTES : DEADLINE_MINUTES;
  const deadlineAt = startedAt + minutes * MINUTE;

  if (browser) {
    const oldFiles = browserBundleFiles(oldBuild, threaded);
    const newFiles = browserBundleFiles(newBuild, threaded);
    describeBuilds(oldFiles, newFiles);
    const files = oldFiles.concat(newFiles);
    return report(
      await compareBrowser({
        oldUrl: oldBuild,
        newUrl: newBuild,
        files,
        threaded,
        selfTest,
        deadlineAt,
        minutes,
      }),
    );
  }

  const oldFiles = nodeBundleFiles(oldBuild);
  const newFiles = nodeBundleFiles(newBuild);
  describeBuilds(oldFiles, newFiles);
  const work = compareNode(
    oldFiles[0].file,
    newFiles[0].file,
    selfTest,
    deadlineAt,
  ).catch((error) => {
    // runScenarios checks the deadline between frames, which run without yielding.
    throw error && error.deadline ? deadlineFailure(minutes) : error;
  });
  return report(await withDeadline(work, deadlineAt, minutes));
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    const message =
      error && error.expected ? error.message : (error && error.stack) || error;
    console.error(`compare-builds: ${message}`);
    process.exit(2);
  },
);
