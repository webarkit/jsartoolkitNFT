// A custom pose filter module for createNFTTracker({ filter: { module, options } }) (D14).
//
// To write your own: copy this file, keep the `createPoseFilter(options)` export (the tracker
// rejects a module without it), and return an object with `filter(timeMs, pose)` and `reset()`.
// The tracker creates one filter per marker and calls reset() when the marker is lost.
// Load it by URL, e.g. { module: "/filters/my-filter.js", options: { weight: 0.5 } }.
// Under COEP a module from another origin needs CORS and Cross-Origin-Resource-Policy headers.
//
// Running average with a configurable weight, so a test can predict the output.
export function createPoseFilter(options) {
  const w = options.weight;
  let prev = null;
  return {
    filter(timeMs, pose) {
      if (!prev) { prev = Float64Array.from(pose); return prev; }
      for (let i = 0; i < pose.length; i++) prev[i] = prev[i] * (1 - w) + pose[i] * w;
      return Float64Array.from(prev);
    },
    reset() { prev = null; },
  };
}
