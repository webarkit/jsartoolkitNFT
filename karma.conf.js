// Karma configuration - Unified for all legacy builds
const fs = require('fs');
const path = require('path');

// --- Dynamic Build File Selection ---

// Get the target build file from an environment variable.
// Default to the most stable production build if not specified.
const buildFileToTest = process.env.BUILD_TARGET || 'artoolkitNFT.min.js';
const buildFilePath = path.join('build', buildFileToTest);

if (!fs.existsSync(buildFilePath)) {
    console.error(`[Karma] Error: Build file not found: ${buildFilePath}`);
    console.error(`[Karma] Please run the build script first, or specify a valid BUILD_TARGET.`);
    process.exit(1);
}

console.log(`[Karma] Using build file for testing: ${buildFilePath}`);

// --- End Dynamic Selection ---

module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine"],
    plugins: ['karma-jasmine', 'karma-chrome-launcher'],

    // Dynamically load the selected build file.
    // No setup script is needed; the test file handles initialization.
    files: [
      buildFilePath,
      'tests/tests.test.js', // The single, unified test file
      {
        pattern: 'examples/Data/*',
        watched: false,
        included: false,
        served: true,
        nocache: false
      }
    ],

    proxies: {
        '/examples/Data/': '/base/examples/Data/'
    },

    exclude: [],
    preprocessors: {},
    reporters: ["progress"],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ["ChromeHeadless"],
    singleRun: true,
    concurrency: Infinity,

    client: {
        clearContext: false,
        jasmine: {
            // A generous timeout to allow for Wasm compilation and initialization
            DEFAULT_TIMEOUT_INTERVAL: 20000
        }
    }
  });
};
