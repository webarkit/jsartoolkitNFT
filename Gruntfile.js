/* global module,require */
module.exports = function (grunt) {
  'use strict'

  var pkg = grunt.file.readJSON('package.json')

  grunt.initConfig({
    pkg: pkg,

    jshint: ['js/artoolkitNFT.api.js', 'js/artoolkitNFT.worker.js'],
    qunit: {
      qunit: {
        all: {
          options: {
            urls: ['http://localhost:8000/tests/index.html']
          }
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-contrib-jshint')
  grunt.loadNpmTasks('grunt-contrib-qunit')
}
