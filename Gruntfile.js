/*global module,require */
module.exports = function(grunt) {
  "use strict";

  var pkg = grunt.file.readJSON("package.json");

  grunt.initConfig({
    pkg: pkg,

    concat: {
      dist: {
        src: [
          'src/arnft-constructor.js',
          'src/arnft-init.js',
          'src/arnft-add.js',
          'src/arnft-loadmodel.js',
          'src/utils/isMobile.js',
          'src/utils/setMatrix.js',
          'src/utils/start.js',
          'src/utils/html/createLoading.js',
          'src/utils/html/createContainer.js',
          'src/utils/html/createStats.js',
          'src/utils/jsonParser.js'],
        dest: 'dist/arNFT.js',
        options: {
          banner: "/*jshint esversion: 8 */\n;(function(){ \n 'use strict';\n\n",
          footer: "\nwindow.ARnft = ARnft;\nwindow.THREE = THREE;\n}());"
        }
      }
    },

    jshint: {
      beforeconcat: [
        'src/arnft-constructor.js',
        'src/arnft-init.js',
        'src/arnft-add.js',
        'src/arnft-loadmodel.js',
        'src/utils/isMobile.js',
        'src/utils/setMatrix.js',
        'src/utils/start.js',
        'src/utils/html/createLoading.js',
        'src/utils/html/createContainer.js',
        'src/utils/html/createStats.js',
        'src/utils/jsonParser.js'],
      afterconcat: ['dist/arNFT.js']
    },

    terser: {
      options: {},
      dist: {
        src: "dist/arNFT.js",
        dest: "dist/arNFT.min.js"
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks("grunt-terser");
};
