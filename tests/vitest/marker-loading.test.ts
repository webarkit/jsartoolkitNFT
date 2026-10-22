import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import {
  CAMERA_PARAM,
  MARKER_PINBALL,
  MARKER_KUVA,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from "./helpers";
import { VARIANTS } from "./variants";

/**
 * Promise-based NFT marker loading with fetch (#685), toolkit part.
 *
 * These specs drive `ARToolkitNFTBase.addNFTMarkers` directly, reached as
 * `ar.artoolkitNFT` on a controller from `initWithDimensions`, which has already
 * run `setupAR2`. The native core hands out cumulative ids, so any test that
 * asserts an exact id runs on a fresh controller.
 *
 * `fetch` is spied on or stubbed per test, always after the controller is built
 * (its camera load uses `fetch` too), and restored after every test.
 */

const ZFT_PINBALL = "/examples/DataNFT/zft/pinball";
const PINBALL_FILES = [
  MARKER_PINBALL + ".fset",
  MARKER_PINBALL + ".iset",
  MARKER_PINBALL + ".fset3",
];

const realFetch = globalThis.fetch.bind(globalThis);

function urlOf(input: any): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Spies on fetch, passing every request through to the real one. */
function spyFetch() {
  return vi.spyOn(globalThis, "fetch");
}

/**
 * Stubs fetch: `handler` answers a request by returning a Promise, or passes
 * it to the real fetch by returning undefined.
 */
function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | undefined,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: any, init?: RequestInit) => {
      return handler(urlOf(input), init) ?? realFetch(input, init);
    });
}

/** A response that never arrives, but honours the request's signal. */
function pendingUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

function calledUrls(spy: { mock: { calls: any[][] } }): string[] {
  return spy.mock.calls.map((c) => urlOf(c[0]));
}

/** The FS entries under the marker prefixes, as a set of names. */
function markerEntries(tk: any): Set<string> {
  return new Set(
    (tk.FS.readdir("/") as string[]).filter(
      (n) => n.startsWith("markerNFT_") || n.startsWith("tempMarkerNFT_"),
    ),
  );
}

async function freshController(variant: (typeof VARIANTS)[number]) {
  const { ARControllerNFT } = await variant.load();
  const ar = await ARControllerNFT.initWithDimensions(
    VIDEO_WIDTH,
    VIDEO_HEIGHT,
    CAMERA_PARAM,
    true,
  );
  return { ar, tk: (ar as any).artoolkitNFT };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

for (const variant of VARIANTS) {
  describe(`addNFTMarkers Promise loading (#685, ${variant.name})`, () => {
    let ar: any;
    let tk: any;
    const fresh: any[] = [];

    beforeAll(async () => {
      ({ ar, tk } = await freshController(variant));
    }, 150_000);

    afterAll(() => {
      ar?.dispose?.();
      for (const c of fresh) c?.dispose?.();
    });

    it("resolves with the real ids across calls", async () => {
      const c = await freshController(variant);
      fresh.push(c.ar);
      expect(await c.tk.addNFTMarkers([MARKER_PINBALL])).toEqual([0]);
      expect(await c.tk.addNFTMarkers([MARKER_KUVA])).toEqual([1]);
    }, 120_000);

    it("settles after loading", async () => {
      const c = await freshController(variant);
      fresh.push(c.ar);
      await c.tk.addNFTMarkers([MARKER_PINBALL, MARKER_KUVA]);
      // No await between the two: the Promise only settles once the batch is
      // registered, so the second marker's data is already there.
      expect((c.tk.getNFTData(1) as any).width).toBeGreaterThan(0);
    }, 120_000);

    it("loads an explicit .zft with one request", async () => {
      const spy = spyFetch();
      const ids = await tk.addNFTMarkers([ZFT_PINBALL + ".zft"]);
      expect(ids).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(1);
    }, 120_000);

    it("probes .zft with one request", async () => {
      const spy = spyFetch();
      const ids = await tk.addNFTMarkers([ZFT_PINBALL]);
      expect(ids).toHaveLength(1);
      expect(calledUrls(spy)).toEqual([ZFT_PINBALL + ".zft"]);
    }, 120_000);

    it("falls back after a 404 probe", async () => {
      const spy = spyFetch();
      const ids = await tk.addNFTMarkers([MARKER_PINBALL]);
      expect(ids).toHaveLength(1);
      expect(calledUrls(spy)).toEqual([
        MARKER_PINBALL + ".zft",
        ...PINBALL_FILES,
      ]);
    }, 120_000);
  });
}

describe(`addNFTMarkers outcomes (#685, ${VARIANTS[0].name})`, () => {
  const variant = VARIANTS[0];
  let ar: any;
  let tk: any;
  const fresh: any[] = [];

  beforeAll(async () => {
    ({ ar, tk } = await freshController(variant));
  }, 150_000);

  afterAll(() => {
    ar?.dispose?.();
    for (const c of fresh) c?.dispose?.();
  });

  it("rejects a 404 in Promise style", async () => {
    await expect(
      tk.addNFTMarkers(["/examples/DataNFT/missing"], undefined, undefined, {
        probeZFT: false,
      }),
    ).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "http",
      status: 404,
    });
  });

  it("callback style reports once", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const ids = await tk.addNFTMarkers(
      ["/examples/DataNFT/missing"],
      onSuccess,
      onError,
      { probeZFT: false },
    );
    expect(ids).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(404);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("two failing files give one onError", async () => {
    const onError = vi.fn();
    const ids = await tk.addNFTMarkers(
      [["/x/a.fset", "/x/a.iset", "/x/a.fset3"]],
      undefined,
      onError,
    );
    expect(ids).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("network failure does not hang", async () => {
    stubFetch((url) =>
      url.endsWith(".iset")
        ? Promise.reject(new TypeError("Failed to fetch"))
        : undefined,
    );
    await expect(tk.addNFTMarkers([MARKER_PINBALL])).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "network",
    });
  }, 5_000);

  it("403 probe falls back", async () => {
    const spy = stubFetch((url) =>
      url.endsWith(".zft")
        ? Promise.resolve(new Response(null, { status: 403 }))
        : undefined,
    );
    const ids = await tk.addNFTMarkers([MARKER_PINBALL]);
    expect(ids).toHaveLength(1);
    expect(calledUrls(spy)).toEqual([
      MARKER_PINBALL + ".zft",
      ...PINBALL_FILES,
    ]);
  }, 120_000);

  it("probeZFT false makes no .zft request", async () => {
    const spy = spyFetch();
    const ids = await tk.addNFTMarkers([MARKER_PINBALL], undefined, undefined, {
      probeZFT: false,
    });
    expect(ids).toHaveLength(1);
    expect(calledUrls(spy)).toEqual(PINBALL_FILES);
  }, 120_000);

  it("junk .zft is format", async () => {
    stubFetch((url) =>
      url.endsWith(".zft")
        ? Promise.resolve(
            new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          )
        : undefined,
    );
    await expect(tk.addNFTMarkers([MARKER_PINBALL])).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "format",
    });
  });

  it("already-aborted signal", async () => {
    const spy = spyFetch();
    await expect(
      tk.addNFTMarkers([MARKER_PINBALL], undefined, undefined, {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("abort during download", async () => {
    const c = await freshController(variant);
    fresh.push(c.ar);
    let started!: () => void;
    const firstFetch = new Promise<void>((r) => (started = r));
    stubFetch((_url, init) => {
      started();
      return pendingUntilAborted(init);
    });
    const ctrl = new AbortController();
    const p = c.tk.addNFTMarkers([MARKER_PINBALL], undefined, undefined, {
      signal: ctrl.signal,
    });
    await firstFetch;
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });

    vi.restoreAllMocks();
    // Nothing from the aborted call was registered, so the next marker is 0.
    expect(await c.tk.addNFTMarkers([MARKER_PINBALL])).toEqual([0]);
  }, 150_000);

  it("timeout", async () => {
    stubFetch((_url, init) => pendingUntilAborted(init));
    await expect(
      tk.addNFTMarkers([MARKER_PINBALL], undefined, undefined, {
        signal: AbortSignal.timeout(50),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("FS cleanup", async () => {
    const before = markerEntries(tk);

    // A file list whose .fset3 fails only after the other two files have been
    // downloaded and written, so there is something to clean up.
    stubFetch((url) =>
      url.endsWith(".fset3")
        ? new Promise<Response>((r) =>
            setTimeout(() => r(new Response(null, { status: 404 })), 1_000),
          )
        : undefined,
    );
    await expect(tk.addNFTMarkers([PINBALL_FILES])).rejects.toMatchObject({
      kind: "http",
    });
    expect(markerEntries(tk)).toEqual(before);
    vi.restoreAllMocks();

    // A .zft that downloads and is written, then fails to decompress.
    stubFetch((url) =>
      url.endsWith(".zft")
        ? Promise.resolve(
            new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          )
        : undefined,
    );
    await expect(tk.addNFTMarkers([ZFT_PINBALL])).rejects.toMatchObject({
      kind: "format",
    });
    expect(markerEntries(tk)).toEqual(before);
    vi.restoreAllMocks();

    // D11: a download that ignores the abort and lands after the failure must
    // not write its file after the cleanup. The .fset fails at once; the .iset
    // answers 300 ms later regardless of the signal.
    stubFetch((url) => {
      if (url.endsWith(".fset")) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      if (url.endsWith(".iset")) {
        return new Promise<Response>((r) =>
          setTimeout(
            () => r(new Response(new Uint8Array([0x41]), { status: 200 })),
            300,
          ),
        );
      }
      return undefined;
    });
    await expect(tk.addNFTMarkers([PINBALL_FILES])).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(markerEntries(tk)).toEqual(before);
  }, 120_000);

  it("empty inputs", async () => {
    const spy = spyFetch();
    await expect(tk.addNFTMarkers([])).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "argument",
    });
    await expect(tk.addNFTMarkers([""])).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "argument",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("query string in a file list (RF1)", async () => {
    const ids = await tk.addNFTMarkers([PINBALL_FILES.map((u) => u + "?v=2")]);
    expect(ids).toHaveLength(1);
  }, 120_000);

  it("concurrent calls (RF2)", async () => {
    const c = await freshController(variant);
    fresh.push(c.ar);
    const [a, b] = await Promise.all([
      c.tk.addNFTMarkers([MARKER_PINBALL]),
      c.tk.addNFTMarkers([MARKER_KUVA]),
    ]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(new Set([...a, ...b])).toEqual(new Set([0, 1]));
  }, 150_000);

  it("late abort is ignored (RF5)", async () => {
    const c = await freshController(variant);
    fresh.push(c.ar);
    const ctrl = new AbortController();
    const ids = await c.tk.addNFTMarkers(
      [MARKER_PINBALL],
      undefined,
      undefined,
      {
        signal: ctrl.signal,
      },
    );
    expect(ids).toEqual([0]);
    const entries = markerEntries(c.tk);
    ctrl.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(ids).toEqual([0]);
    expect(markerEntries(c.tk)).toEqual(entries);
    expect((c.tk.getNFTData(0) as any).width).toBeGreaterThan(0);
  }, 150_000);

  it("loadCamera 404", async () => {
    await expect(
      tk.loadCamera("/examples/Data/missing.dat"),
    ).rejects.toMatchObject({
      name: "NFTLoadError",
      kind: "http",
    });
  });
});
