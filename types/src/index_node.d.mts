// Copied by tools/build-ts.mjs to types/src/index_node.d.mts (#577, D7). The `import`
// condition of "exports" points here, so that node16/nodenext resolution sees ESM
// declarations: the named exports, plus a default export typed as the module namespace,
// like dist/ARToolkitNFT_node.mjs. The default export is kept for backward compatibility
// with the documented `import pkg from "@webarkit/jsartoolkit-nft"` (module.exports).
import * as ns from "./index_node.js";
export * from "./index_node.js";
declare const _default: typeof ns;
export default _default;
