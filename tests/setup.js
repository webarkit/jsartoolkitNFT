// This script runs before all other scripts in Karma.
// It ensures that the Emscripten Module object exists in the global scope.

console.log("[SETUP] Initializing Module object for Emscripten...");

window.Module = {
  print: (text) => {
    console.log("[EM_PRINT] " + text);
  },
  printErr: (text) => {
    console.error("[EM_ERROR] " + text);
  },
  setStatus: (text) => {
    console.log("[EM_STATUS] " + text);
  },
};

console.log("[SETUP] Module object initialized.");
