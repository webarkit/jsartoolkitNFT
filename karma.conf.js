// Karma configuration

module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine"],

    // Use the minified production build, as it is the most stable asm.js target.
    files: [
      'build/artoolkitNFT.min.js',
      'tests/tests-min.test.js',
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
    autoWatch: true,
    browsers: ["ChromeHeadless"],
    singleRun: true,
    concurrency: Infinity,

    client: {
        clearContext: false,
        jasmine: {
            DEFAULT_TIMEOUT_INTERVAL: 20000 // A generous timeout for the entire setup
        }
    }
  });
};
