/*global module,require */
module.exports = function(grunt) {
  "use strict";

  var pkg = grunt.file.readJSON("package.json");

  grunt.initConfig({
    pkg: pkg,

    terser: {
      options: {},
      dist: {
        src: "src/arNFT.js",
        dest: "dist/arNFT.min.js"
      }
    }
  });

  grunt.loadNpmTasks("grunt-terser");
};
