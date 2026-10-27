/**
 * Vitest globalSetup (runs in Node, before the browser starts): copies the built tracker
 * worker bundles, `dist/NFTTracker*.worker.js`, to `tests/vitest/.workers/<file>.txt`.
 *
 * tracker-worker.test.ts starts each worker from a Blob URL of its text (#720 D15). Vite
 * transforms the `.js` files it serves (it prepends a `/@vite/client` import and rewrites
 * `import()`), and that breaks inside a Blob worker; a `.txt` copy is served as it is.
 * The pthread file is not copied: the td host resolves it against `workerBase` (D16), so
 * it is served from `dist/` directly.
 *
 * The bundles come from `npm run build-ts`, so the copies always match `dist/`.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "tests", "vitest", ".workers");

export default function setup(): void {
  const files = readdirSync(DIST).filter((f) =>
    /^NFTTracker.*\.worker\.js$/.test(f),
  );
  if (files.length === 0) {
    throw new Error(
      "worker-sources: no dist/NFTTracker*.worker.js; run `npm run build-ts` first",
    );
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of files) copyFileSync(join(DIST, f), join(OUT, `${f}.txt`));
}
