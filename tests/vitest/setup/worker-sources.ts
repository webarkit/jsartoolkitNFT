/**
 * Vitest globalSetup (runs in Node, before the browser starts): copies the built bundles
 * the browser specs must load untransformed to `tests/vitest/.dist/<file>.txt`:
 * - the tracker worker bundles, `dist/NFTTracker*.worker.js` (tracker-worker.test.ts);
 * - the UMD bundles `dist/ARToolkitNFT.js` and `dist/ARToolkitNFT_td.js`
 *   (dist-bundle.test.ts).
 *
 * The specs start them from Blob URLs of that text (#720 D15). Vite's dev server
 * transforms the `.js` files it serves: it rewrites every non-literal `import()` to
 * `__vite__injectQuery(...)`, even under `/* @vite-ignore *\/` (which only silences its
 * warning), and prepends `import ... from "/@vite/client"`. That turns a bundle into an
 * ES module, which breaks a Blob worker, a classic <script> and importScripts(). A `.txt`
 * copy is served as it is, as a consumer gets the file from public/ or a CDN.
 * The td pthread files are not copied: they are served from `dist/` directly, resolved
 * against `workerBase` (D16) or the bundle-URL global (dist-bundle.test.ts).
 *
 * The bundles come from `npm run build-ts`, so the copies always match `dist/`.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "tests", "vitest", ".dist");
const UMD = ["ARToolkitNFT.js", "ARToolkitNFT_td.js"];

export default function setup(): void {
  const present = readdirSync(DIST);
  const workers = present.filter((f) => /^NFTTracker.*\.worker\.js$/.test(f));
  const missing = UMD.filter((f) => !present.includes(f));
  if (workers.length === 0 || missing.length > 0) {
    throw new Error(
      "worker-sources: dist/ lacks the NFTTracker*.worker.js or UMD bundles; run `npm run build-ts` first",
    );
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of [...workers, ...UMD]) {
    copyFileSync(join(DIST, f), join(OUT, `${f}.txt`));
  }
}
