// Karma configuration
// Generated on Mon Mar 07 2022 12:03:44 GMT+0100 (Ora standard dell’Europa centrale)

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: "",

    // frameworks to use
    // available frameworks: https://www.npmjs.com/search?q=keywords:karma-adapter
    frameworks: ["qunit"],

    plugins: ["karma-qunit", "karma-chrome-launcher", "karma-firefox-launcher"],

    // list of files / patterns to load in the browser
    files: [
      { pattern: "build/artoolkitNFT.min.js", included: true },
      { pattern: "tests/*.js", included: true },
      {
        pattern: "examples/Data/camera_para.dat",
        watched: false,
        included: false,
        served: true,
        nocache: false,
      },
    ],

    // list of files / patterns to exclude
    exclude: [],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://www.npmjs.com/search?q=keywords:karma-preprocessor
    preprocessors: {},

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter
    reporters: ["progress"],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://www.npmjs.com/search?q=keywords:karma-launcher
    browsers: [
      process.platform === "linux" ? "ChromiumHeadless" : "ChromeHeadless",
      "FirefoxHeadless",
    ],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: Infinity,

    client: {
      clearContext: false,
      qunit: {
        showUI: true,
        testTimeout: 5000,
      },
    },
  });
};
