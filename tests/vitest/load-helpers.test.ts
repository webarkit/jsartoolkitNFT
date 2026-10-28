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

describe("Utils.extensionOf", () => {
  it("reads the extension of the last path segment, without query or hash", () => {
    expect(Utils.extensionOf("/x/pinball.fset?v=2")).toBe("fset");
    expect(Utils.extensionOf("pinball.zft#top")).toBe("zft");
    expect(Utils.extensionOf("https://cdn.example/m/pinball.iset")).toBe(
      "iset",
    );
    expect(Utils.extensionOf("../DataNFT/pinball")).toBe("");
    expect(Utils.extensionOf("/a.b/pinball")).toBe("");
    expect(Utils.extensionOf("/x/pinball?file=a.zft")).toBe("");
  });

  // In an about:blank or about:srcdoc frame, location.href is "about:blank"
  // or "about:srcdoc", against which a relative URL cannot be resolved, while
  // fetch resolves it against the document base. The extension must not need
  // that resolution (#736 review).
  it("needs no base URL for a relative marker URL", () => {
    expect(() => new URL("../DataNFT/pinball.fset", "about:blank")).toThrow(
      TypeError,
    );
    expect(Utils.extensionOf("../DataNFT/pinball.fset")).toBe("fset");
    expect(Utils.extensionOf("DataNFT/zft/pinball.zft")).toBe("zft");
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

  it("maps a body that fails mid-download to network", async () => {
    const reset = new TypeError("reset");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.error(reset);
            },
          }),
        ),
      ),
    );
    const err: any = await Utils.fetchBinary("/x").catch((e) => e);
    expect(err).toMatchObject({
      name: "NFTLoadError",
      kind: "network",
      url: "/x",
    });
    expect(err.cause).toBeDefined();
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

  it("calls onSuccess with the value and resolves it", async () => {
    const onSuccess = vi.fn();
    await expect(
      withCallbacks(Promise.resolve([7]), onSuccess, undefined, [] as number[]),
    ).resolves.toEqual([7]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith([7]);
  });

  it("rejects when onError itself throws", async () => {
    const boom = new Error("boom");
    await expect(
      withCallbacks(
        Promise.reject(new Error("x")),
        undefined,
        () => {
          throw boom;
        },
        [],
      ),
    ).rejects.toBe(boom);
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
