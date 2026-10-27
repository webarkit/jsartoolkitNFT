import { describe, it, expect } from "vitest";
import { copyFrame } from "../../src/tracker/frame";

/**
 * copyFrame (#720 D6): the three input forms of process(), and the size check.
 */
describe("copyFrame", () => {
  it("returns ImageData.data as is", () => {
    const img = new ImageData(4, 3);
    expect(copyFrame(img, 4, 3)).toBe(img.data);
  });

  it("accepts { data: Uint8Array, width, height }", () => {
    const data = new Uint8Array(4 * 3 * 4).map((_, i) => i);
    expect(copyFrame({ data, width: 4, height: 3 }, 4, 3)).toBe(data);
  });

  it("reads back an ImageBitmap of the right size", async () => {
    const img = new ImageData(4, 3);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data.set([200, 100, 50, 255], i);
    }
    const bitmap = await createImageBitmap(img);
    const out = copyFrame(bitmap, 4, 3);
    expect(out.length).toBe(4 * 3 * 4);
    expect(Array.from(out.slice(0, 4))).toEqual([200, 100, 50, 255]);
    expect(Array.from(out.slice(-4))).toEqual([200, 100, 50, 255]);
  });

  it("throws RangeError naming both sizes", () => {
    const img = new ImageData(641, 480);
    expect(() => copyFrame(img, 640, 480)).toThrow(RangeError);
    expect(() => copyFrame(img, 640, 480)).toThrow(/641x480.*640x480/);
  });

  it("throws RangeError when the data length does not match the size", () => {
    const data = new Uint8Array(10);
    expect(() => copyFrame({ data, width: 4, height: 3 }, 4, 3)).toThrow(
      RangeError,
    );
  });
});
