import { describe, it, expect, vi, afterEach } from "vitest";
import Utils from "../../src/Utils";
import { NFTLoadError, withCallbacks } from "../../src/NFTLoadError";

const ascii = (s: string) => new TextEncoder().encode(s);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Utils.hexToBytes", () => {
  it("decodes upper and lower case", () => {
    expect(Utils.hexToBytes(ascii("00ff7Fa0"))).toEqual(
      new Uint8Array([0, 255, 127, 160]),
    );
  });

  it("rejects odd length and non-hex", () => {
    expect(() => Utils.hexToBytes(ascii("abc"))).toThrow(RangeError);
    expect(() => Utils.hexToBytes(ascii("zz"))).toThrow(RangeError);
  });
});

describe("Utils.fetchBinary", () => {
  it("returns the bytes", async () => {
    const bytes = await Utils.fetchBinary("/examples/DataNFT/zft/pinball.zft");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("maps a 404", async () => {
    await expect(
      Utils.fetchBinary("/examples/DataNFT/missing.fset"),
    ).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "http",
      status: 404,
      url: "/examples/DataNFT/missing.fset",
    });
  });

  it("maps a rejected fetch", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    const err: any = await Utils.fetchBinary("/x").catch((e) => e);
    expect(err.kind).toBe("network");
    expect(err.cause).toBe(cause);
  });

  it("passes an abort through", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      Utils.fetchBinary("/examples/DataNFT/zft/pinball.zft", ac.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("withCallbacks", () => {
  it("returns the work unchanged without callbacks", async () => {
    await expect(
      withCallbacks(Promise.reject(new Error("x")), undefined, undefined, []),
    ).rejects.toThrow("x");
  });

  it("routes a failure to onError with the HTTP status and resolves empty", async () => {
    const onError = vi.fn();
    const work = Promise.reject(
      new NFTLoadError("http", "nope", { status: 404 }),
    );
    await expect(withCallbacks(work, undefined, onError, [])).resolves.toEqual(
      [],
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(404);
  });

  it("logs a failure when only onSuccess is given", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onSuccess = vi.fn();
    await expect(
      withCallbacks(Promise.reject(new Error("x")), onSuccess, undefined, []),
    ).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("rejects with a throw from onSuccess and never calls onError", async () => {
    const onError = vi.fn();
    const boom = new Error("boom");
    await expect(
      withCallbacks(
        Promise.resolve([1]),
        () => {
          throw boom;
        },
        onError,
        [] as number[],
      ),
    ).rejects.toBe(boom);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("NFTLoadError", () => {
  it("keeps its cause", () => {
    const c = new Error("c");
    const e = new NFTLoadError("format", "m", { cause: c });
    expect(e.cause).toBe(c);
    expect(e.name).toBe("NFTLoadError");
  });
});
