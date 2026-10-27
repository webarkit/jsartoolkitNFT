/**
 * The Vite configuration for the published bundles in dist/ (#741).
 *
 * Vite cannot emit several UMD bundles in one pass, so tools/build-ts.mjs calls
 * `vite build` once per variant with `libConfig(variant)`:
 * - "default", "simd", "td": UMD browser bundles (ARToolkitNFT.js, ARToolkitNFT_simd.js,
 *   ARToolkitNFT_td.js), loaded with <script>, importScripts() or a bundler;
 * - "node": the CommonJS bundle for Node (ARToolkitNFT_node.js);
 * - "worker-default", "worker-simd", "worker-td": the tracker facade's ES module workers
 *   (NFTTracker.worker.js, NFTTracker_simd.worker.js, NFTTracker_td.worker.js, #720 D16).
 *
 * D-numbers refer to the decisions in specs/2026-10-24-vite-build-design.md.
 */
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { bundleUrlBanner } = require("./tools/bundle-url.js");

const ROOT = import.meta.dirname;

/**
 * Per browser variant: the entry, the output file, the UMD library name and the global
 * that holds the bundle's URL.
 * - The UMD name must not collide with an export (`ARToolkitNFT` is one), hence `_exports`.
 * - Each bundle has its own URL global, so a page that loads two bundles cannot make one
 *   resolve its files against the other's folder (D5.2).
 */
const BROWSER = {
  default: {
    entry: "src/index.ts",
    file: "ARToolkitNFT.js",
    name: "ARToolkitNFT_exports",
    urlGlobal: "__artkBundleUrl",
  },
  simd: {
    entry: "src/index_simd.ts",
    file: "ARToolkitNFT_simd.js",
    name: "ARToolkitNFT_simd_exports",
    urlGlobal: "__artkSimdBundleUrl",
  },
  td: {
    entry: "src/index_td.ts",
    file: "ARToolkitNFT_td.js",
    name: "ARToolkitNFT_td_exports",
    urlGlobal: "__artkTdBundleUrl",
  },
};

/**
 * The tracker facade's worker bundles (#720 D16): one ES module per build, started by
 * createNFTTrackerWorker with `new Worker(url, { type: "module" })`.
 */
const WORKER = {
  "worker-default": {
    entry: "src/tracker/worker/host_default.ts",
    file: "NFTTracker.worker.js",
  },
  "worker-simd": {
    entry: "src/tracker/worker/host_simd.ts",
    file: "NFTTracker_simd.worker.js",
  },
  "worker-td": {
    entry: "src/tracker/worker/host_td.ts",
    file: "NFTTracker_td.worker.js",
  },
};

/** Settings every variant shares. */
function common() {
  return {
    root: ROOT,
    // Not read from a vite.config.* file: everything is in this factory.
    configFile: false,
    // There is no public/ folder to copy; never let one leak into dist/.
    publicDir: false,
    // Relative asset URLs; the threaded worker's URL is then rewritten by renderBuiltUrl.
    base: "./",
    logLevel: "warn",
  };
}

function commonBuild() {
  return {
    outDir: "dist",
    // The builds share dist/, and dist/ also holds files no build owns.
    // tools/build-ts.mjs deletes only the files the builds write (D10).
    emptyOutDir: false,
    // Published bundles are minified, as webpack's production mode did.
    minify: true,
    // No source maps in dist/, as before.
    sourcemap: false,
    // No assetsInlineLimit: workers from `new Worker(new URL(...))` are emitted as files
    // whatever their size (checked by building without it), so the pthread worker keeps
    // its fixed name (D3).
  };
}

/**
 * @param {"default" | "simd" | "td" | "node" | "worker-default" | "worker-simd" | "worker-td"} variant
 * @param {{ watch?: boolean }} [options]
 * @returns {import("vite").InlineConfig}
 */
export function libConfig(variant, options = {}) {
  const watch = options.watch ? {} : null;

  if (variant === "node") {
    return {
      ...common(),
      // An SSR build externalizes node_modules by default, but @webarkit/oneeurofilter-ts
      // is a devDependency that must ship inside the bundle (#720 D19): a consumer's
      // require() of the Node entry would otherwise fail to resolve it.
      ssr: { noExternal: ["@webarkit/oneeurofilter-ts"] },
      build: {
        ...commonBuild(),
        watch,
        // An SSR build targets Node: Node built-ins (fs, path, crypto, url, events, …)
        // stay external `require()` calls instead of being polyfilled or stubbed. The
        // Emscripten Node glue requires them, and so does src/ARControllerNFT_node.ts
        // (`require('events')`) (D7).
        // The entry goes here: with `ssr` set, Vite takes the input from it and ignores
        // build.lib's entry and fileName, so the format and the name are set on the output.
        ssr: resolve(ROOT, "src/index_node.ts"),
        rollupOptions: {
          // Belt and braces for the SSR default above: `events` is required by the
          // library's own code, not only the glue.
          external: [
            /^node:/,
            "fs",
            "path",
            "crypto",
            "url",
            "events",
            "worker_threads",
            "module",
          ],
          output: {
            // CommonJS, as webpack's commonjs2: require() consumers are unchanged (D2).
            format: "cjs",
            entryFileNames: "ARToolkitNFT_node.js",
            // Keep `__esModule: true` on the CommonJS exports, as webpack set it, so a
            // default import resolves as before for TypeScript-compiled CJS consumers (D8).
            esModule: true,
            exports: "named",
          },
        },
      },
    };
  }

  const w = WORKER[variant];
  if (w) {
    return {
      ...common(),
      // D16: no `define` of import.meta.url, no banner, no footer and no renderBuiltUrl,
      // unlike the UMD bundles. These are ES modules, so the real import.meta.url already
      // resolves next to the file; mapping it to a globalThis.__artk* URL global, which
      // nothing sets in the worker, would break it. The threaded host does not rely on it
      // for its pthreads anyway: it passes mainScriptUrlOrBlob (host.ts).
      ...(variant === "worker-td"
        ? {
            // The glue's pthread worker, emitted from the glue's
            // `new Worker(new URL(..., import.meta.url), { type: "module" })`.
            worker: {
              format: "es",
              rollupOptions: {
                output: { entryFileNames: "NFTTracker_td.pthread.js" },
              },
            },
          }
        : {}),
      build: {
        ...commonBuild(),
        watch,
        lib: {
          entry: resolve(ROOT, w.entry),
          formats: ["es"],
          fileName: () => w.file,
        },
        rollupOptions: {
          output: {
            // One file per worker: the user's filter module is the only dynamic import,
            // and it is left alone (@vite-ignore, D14).
            codeSplitting: false,
            // Vite's `minify` keeps the whitespace and comments of an ES lib build, so that
            // a re-bundler can still read pure annotations. These workers are loaded as
            // they are, never re-bundled, so they are minified fully like the UMD bundles.
            minify: true,
          },
        },
      },
    };
  }

  const v = BROWSER[variant];
  if (!v) throw new Error(`unknown variant: ${variant}`);

  return {
    ...common(),
    // The Emscripten ES6 glue reads import.meta.url, and UMD has no import.meta. Map it to
    // the bundle URL captured by the banner below. This replaces webpack's
    // OmitImportMetaUrlPlugin, and no build-machine path reaches dist/ (#684, D5.2).
    define: { "import.meta.url": `globalThis.${v.urlGlobal}` },
    experimental: {
      // By default Vite resolves emitted assets against document.baseURI when the code
      // runs, which is the page, not the bundle. The threaded bundle's pthread worker must
      // load from the bundle's own folder, so resolve it against the URL captured at load
      // time (D5.3). Only the "td" variant emits such an asset.
      // The built code reads `new URL(new URL(f, base).href, "" + base)`: Vite wraps the
      // returned expression in its own `new URL(<expr>, "" + base)`, so the outer URL is
      // redundant but harmless (an absolute URL ignores its base) and cannot be removed
      // from here.
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === "js") {
          return {
            runtime: `new URL(${JSON.stringify(filename)}, globalThis.${v.urlGlobal}).href`,
          };
        }
        return { relative: true };
      },
    },
    ...(variant === "td"
      ? {
          // The pthread worker stays an ES module worker, as Emscripten generates it
          // (`type: "module"`): webpack rewrote it to a classic worker, which would mean
          // converting the glue's import.meta (D6). Its name is fixed instead of webpack's
          // changing chunk id, `602.ARToolkitNFT_td.js` (D3).
          // The top-level `define` of import.meta.url also reaches this worker bundle,
          // where `__artkTdBundleUrl` is undefined. That is harmless only because the glue
          // reads import.meta.url inside try/catch and Vite rewrites the nested pthread
          // spawns to `new Worker(self.location.href, { type: "module" })`. A future glue
          // that really uses import.meta.url in the worker would need revisiting.
          worker: {
            format: "es",
            rollupOptions: {
              output: { entryFileNames: "ARToolkitNFT_td.worker.js" },
            },
          },
        }
      : {}),
    build: {
      ...commonBuild(),
      watch,
      lib: {
        entry: resolve(ROOT, v.entry),
        // UMD keeps the contract of the webpack bundles: <script>, importScripts(),
        // CommonJS and AMD (D2).
        formats: ["umd"],
        name: v.name,
        fileName: () => v.file,
      },
      rollupOptions: {
        output: {
          // Must run while the script is evaluated, before the glue reads the URL (D5.2).
          banner: bundleUrlBanner(v.urlGlobal),
          // Vite's UMD puts the exports under the library name. Copy them onto the global
          // object too, as webpack's nameless UMD did, so <script> and importScripts()
          // consumers keep finding ARControllerNFT, ARToolkitNFT, … as globals (D5.1).
          footer: `if(typeof globalThis!=='undefined'&&globalThis.${v.name}){Object.assign(globalThis,globalThis.${v.name});}`,
          // Keep `__esModule: true` on the exports, as webpack set it (D8).
          esModule: true,
        },
      },
    },
  };
}
