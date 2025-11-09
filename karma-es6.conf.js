// Karma configuration for the "true" ES6 module builds.
const path = require('path');
const fs = require('fs');

// Get the target ES6 build file from an environment variable.
const buildFile = process.env.BUILD_TARGET_ES6 || 'artoolkitNFT_ES6_wasm.js';
const buildFilePath = path.resolve(__dirname, 'build', buildFile);

if (!fs.existsSync(buildFilePath)) {
  throw new Error(`[Karma-ES6] Build file not found: ${buildFilePath}\nPlease ensure the build has been generated before running tests.`);
}
console.log(`[Karma-ES6] Using build target: ${buildFile}`);

module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine", "webpack"],
    plugins: ['karma-jasmine', 'karma-webpack', 'karma-chrome-launcher'],

    files: [
      { pattern: 'tests/tests-es6.test.js', type: 'module' },
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

    preprocessors: {
      'tests/tests-es6.test.js': ['webpack']
    },

    webpack: {
        mode: 'development',
        resolve: {
            // Create an alias to point to the correct build file.
            // This allows the test file to have a static import.
            alias: {
                '../build/artoolkitNFT_ES6_wasm.js': buildFilePath,
            },
            fallback: {
                "fs": false,
                "path": false,
                "crypto": false,
                "module": false,
            }
        },
    },

    reporters: ["progress"],
    port: 9879, // A new port for the final test suite
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ["ChromeHeadless"],
    singleRun: true,
    concurrency: Infinity,

    client: {
        clearContext: false,
        jasmine: {
            DEFAULT_TIMEOUT_INTERVAL: 20000
        }
    }
  });
};
