"use strict";
/**
 * The frames the Node comparisons play, decoded with sharp: the photo with both prints
 * (`both`), the photo with the kuva print painted over (`pinballOnly`) and a flat grey frame
 * (`blank`), each a 2000 x 1500 RGBA Uint8Array.
 *
 * Shared by tools/compare-builds.js and tools/compare-python/export-node.js, so that the
 * Python comparison plays byte-identical frames.
 */
const path = require("node:path");
const {
  WIDTH,
  HEIGHT,
  KUVA_PRINT,
  KUVA_FILL,
  BLANK_GREY,
} = require("./scenarios.js");

const EXAMPLE_DIR = path.resolve(__dirname, "..", "..", "examples", "node");

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

module.exports = { loadNodeFrames, EXAMPLE_DIR };
