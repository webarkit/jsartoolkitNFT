/* global module,require */
module.exports = function (grunt) {
  'use strict'

  var pkg = grunt.file.readJSON('package.json')

  grunt.initConfig({
    pkg: pkg,

    concat: {
      regular: {
        src: [
          'src/arnft-constructor.js',
          'src/arnft-init.js',
          'src/arnft-add.js',
          'src/arnft-loadmodel.js',
          'src/arnft-eventlisteners.js',
          'src/arnft-teardownvideo.js',
          'src/utils/isMobile.js',
          'src/utils/setMatrix.js',
          'src/utils/start.js',
          'src/utils/getUserMedia.js',
          'src/utils/html/createLoading.js',
          'src/utils/html/createContainer.js',
          'src/utils/html/createStats.js',
          'src/utils/jsonParser.js'
        ],
        dest: 'dist/arNFT_reg.js',
        options: {
          banner:
            "/*jshint esversion: 8 */\n;(function(window){ \n 'use strict';\n\n",
          footer: '\nwindow.ARnft = ARnft;\nwindow.THREE = THREE;\n}(window));'
        }
      },
      embedded: {
        src: [
          'src/arnft-constructor.js',
          'src/arnft-init.js',
          'src/arnft-add.js',
          'src/arnft-loadmodel.js',
          'src/arnft-eventlisteners.js',
          'src/arnft-teardownvideo.js',
          'src/utils/isMobile.js',
          'src/utils/setMatrix.js',
          'src/utils/getUserMedia.js',
          'src/utils/start-workerBegin.js',
          'src/utils/start-workerEnd.js',
          'src/utils/html/createLoading.js',
          'src/utils/html/createContainer.js',
          'src/utils/html/createStats.js',
          'src/utils/jsonParser.js'
        ],
        dest: 'dist/arNFT.js',
        options: {
          banner:
            "/*jshint esversion: 8 */\n;(function(window){ \n 'use strict';\n\n",
          footer: '\nwindow.ARnft = ARnft;\nwindow.THREE = THREE;\n}(window));'
        }
      }
    },

    jshint: {
      beforeconcat: [
        [
          'src/arnft-constructor.js',
          'src/arnft-init.js',
          'src/arnft-add.js',
          'src/arnft-loadmodel.js',
          'src/arnft-eventlisteners.js',
          'src/arnft-teardownvideo.js',
          'src/utils/isMobile.js',
          'src/utils/setMatrix.js',
          'src/utils/start.js',
          'src/utils/getUserMedia.js',
          'src/utils/html/createLoading.js',
          'src/utils/html/createContainer.js',
          'src/utils/html/createStats.js',
          'src/utils/jsonParser.js'
        ],
        [
          'src/arnft-constructor.js',
          'src/arnft-init.js',
          'src/arnft-add.js',
          'src/arnft-loadmodel.js',
          'src/arnft-eventlisteners.js',
          'src/arnft-teardownvideo.js',
          'src/utils/isMobile.js',
          'src/utils/setMatrix.js',
          'src/utils/getUserMedia.js',
          'src/utils/start-workerBegin.js',
          'src/utils/start-workerEnd.js',
          'src/utils/html/createLoading.js',
          'src/utils/html/createContainer.js',
          'src/utils/html/createStats.js',
          'src/utils/jsonParser.js'
        ]
      ],
      afterconcat: ['dist/arNFT.js', 'dist/arNFT.reg.js']
    },

    terser: {
      options: {
        compress: {},
      },
      target: {
        files: {
          'dist/arNFT.min.js': ['dist/arNFT.js'],
          'dist/arNFT_reg.min.js': ['dist/arNFT_reg.js']
        }
      },
      output: {}
    },
    jsbeautifier: {
      files: ['dist/arNFT.min.js'],
      options: {
        js: {
          braceStyle: "collapse",
          breakChainedMethods: false,
          e4x: false,
          evalCode: false,
          indentChar: '',
          indentLevel: 0,
          indentSize: 2,
          indentWithTabs: false,
          jslintHappy: false,
          keepArrayIndentation: false,
          keepFunctionIndentation: false,
          maxPreserveNewlines: 10,
          preserveNewlines: false,
          spaceBeforeConditional: false,
          spaceInParen: false,
          unescapeStrings: false,
          wrapLineLength: 0,
          endWithNewline: true
        }
      },
    },
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
  grunt.loadNpmTasks('grunt-contrib-concat')
  grunt.loadNpmTasks('grunt-contrib-qunit')
  grunt.loadNpmTasks("grunt-jsbeautifier")
  grunt.loadNpmTasks('grunt-terser')
}
