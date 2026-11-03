/**
 * The GitHub release attaches the files listed in main.yml's Release step, and that list has
 * to keep up with what the builds emit. The step's `fail_on_unmatched_files` catches a listed
 * file that no longer exists, but not a new file nobody listed: dist/NFTTracker.client.mjs
 * (#772) was left out of the 1.16.0 release that way, and attached by hand afterwards.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const MAIN_YML = path.join(ROOT, ".github/workflows/main.yml");

// A vendored copy of @webarkit/oneeurofilter-ts that only the examples load; it is not part
// of this library and ships from its own package.
const NOT_RELEASED = ["js/OneEuroFilter.js", "js/OneEuroFilter.mjs"];

// The `files: |` block of the Release step: one path per line, indented further than the key.
function listedFiles() {
  const lines = fs.readFileSync(MAIN_YML, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*files:\s*\|\s*$/.test(line));
  assert.notEqual(start, -1, "main.yml has no `files: |` block");
  const keyIndent = lines[start].search(/\S/);
  const files = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (line.search(/\S/) <= keyIndent) break;
    files.push(line.trim());
  }
  return files;
}

function emitted(dir, extensions) {
  return fs
    .readdirSync(path.join(ROOT, dir))
    .filter((name) => extensions.some((ext) => name.endsWith(ext)))
    .map((name) => `${dir}/${name}`);
}

describe("GitHub release assets", () => {
  const listed = listedFiles();

  it("list every build, dist and js/ script", () => {
    const expected = [
      ...emitted("build", [".js"]),
      ...emitted("dist", [".js", ".mjs"]),
      ...emitted("js", [".js", ".mjs"]),
    ].filter((file) => !NOT_RELEASED.includes(file));
    const missing = expected.filter((file) => !listed.includes(file));
    assert.deepEqual(missing, [], "add these to the Release step in main.yml");
  });

  it("list only files that exist", () => {
    // The same check as fail_on_unmatched_files, but before a tag is pushed.
    const absent = listed.filter(
      (file) => !fs.existsSync(path.join(ROOT, file)),
    );
    assert.deepEqual(absent, []);
  });
});
