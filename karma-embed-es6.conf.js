// Karma configuration for the ES6 Embed build, using Webpack.

module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine", "webpack"],
    plugins: ['karma-jasmine', 'karma-webpack', 'karma-chrome-launcher'],

    // The test file is the single entry point.
    // Webpack will handle bundling the imported modules.
    files: [
      // Load the test file as a module.
      { pattern: 'tests/tests-embed-es6.test.js', type: 'module' },
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

    // Use the webpack preprocessor for the test file.
    preprocessors: {
      'tests/tests-embed-es6.test.js': ['webpack']
    },

    // Webpack configuration for Karma.
    webpack: {
        mode: 'development',
        // The Emscripten glue code contains references to Node.js modules.
        // We need to provide fallbacks for them to be bundled for the browser.
        resolve: {
            fallback: {
                "fs": false,
                "path": false,
                "crypto": false,
                "module": false,
            }
        },
    },

    reporters: ["progress"],
    port: 9878,
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
