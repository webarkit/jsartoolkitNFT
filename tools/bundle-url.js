/**
 * The banner each Vite UMD bundle runs first: it captures the URL of the folder the
 * bundle was loaded from, into a global of its own (#741, design D5.2).
 *
 * Why it exists:
 * - The Emscripten ES6 glue reads `import.meta.url`, which a UMD bundle cannot contain.
 *   vite.lib.config.mjs maps `import.meta.url` to this global instead, so no build-machine
 *   path ends up in dist/ (#684).
 * - The threaded bundle starts its pthread worker from
 *   `new URL("ARToolkitNFT_td.worker.js", <this URL>)`, so the worker resolves next to the
 *   script that loads the bundle (the bundle's own folder for a plain `<script>` tag, the
 *   calling worker's folder for `importScripts()`, the last `<script src>` folder in
 *   re-bundled apps) and not against the page (`examples/x.html` loading `../dist/...`).
 * - It must run while the script is evaluated: `document.currentScript` is only set then.
 *
 * The rule is webpack's "auto" publicPath, which the webpack bundles used, so the worker
 * keeps resolving exactly where it did before (D2):
 * 1. in a worker (no `document`), `self.location.href`, which is also what a classic
 *    worker calling `importScripts()` gets;
 * 2. otherwise `document.currentScript.src`; when that is empty (a re-bundled or ES-module
 *    consumer), the `src` of the last `<script>` whose `src` is http(s);
 * 3. then strip a `blob:` prefix (a blob worker), the query and the hash, and keep
 *    everything up to the last `/`.
 *
 * Unlike webpack it does not throw when no URL is found: the default and SIMD bundles
 * never use the value, and the threaded bundle fails when it starts the worker instead.
 *
 * CommonJS, so tests/node/bundle-url.test.js can require it with `node --test`.
 */

/**
 * @param {string} globalName the `globalThis` property that receives the URL.
 * @returns {string} the banner source.
 */
function bundleUrlBanner(globalName) {
  return `(function(){var u;
if(typeof document==="undefined"){if(typeof self!=="undefined"&&self.location){u=self.location.href;}}
else{var c=document.currentScript;if(c&&c.src){u=c.src;}
if(!u&&typeof document.getElementsByTagName==="function"){var s=document.getElementsByTagName("script");for(var i=s.length-1;i>-1&&(!u||!/^https?:/.test(u));i--){u=s[i].src;}if(u&&!/^https?:/.test(u)){u=undefined;}}}
if(u){u=String(u).replace(/^blob:|[?#].*$/g,"").replace(/\\/[^/]+$/,"/");}
globalThis[${JSON.stringify(globalName)}]=u;})();`;
}

module.exports = { bundleUrlBanner };
