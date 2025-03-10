/*
 * Simple script for running emcc on ARToolKit
 * @author zz85 github.com/zz85
 * @author ThorstenBux github.com/ThorstenBux
 * @author kalwalt github.com/kalwalt
 */

let exec = require("child_process").exec,
  path = require("path"),
  fs = require("fs"),
  os = require("os"),
  child;

const platform = os.platform();

let NO_LIBAR = false;
/* Filtering remote jitter, but makes the tracking swim */
const WITH_FILTERING = 1;

const arguments = process.argv;

for (let j = 2; j < arguments.length; j++) {
  if (arguments[j] == "--no-libar") {
    NO_LIBAR = true;
    console.log(
      "Building jsartoolkitNFT with --no-libar option, libar will be preserved.",
    );
  }
}

const HAVE_NFT = 1;

const EMSCRIPTEN_ROOT = process.env.EMSCRIPTEN;
const WEBARKITLIB_ROOT =
  process.env.WEBARKITLIB_ROOT ||
  path.resolve(__dirname, "../emscripten/WebARKitLib");

if (!EMSCRIPTEN_ROOT) {
  console.log("\nWarning: EMSCRIPTEN environment variable not found.");
  console.log(
    'If you get a "command not found" error,\ndo `source <path to emsdk>/emsdk_env.sh` and try again.',
  );
}

const EMCC = EMSCRIPTEN_ROOT ? path.resolve(EMSCRIPTEN_ROOT, "emcc ") : "emcc ";
const EMPP = EMSCRIPTEN_ROOT ? path.resolve(EMSCRIPTEN_ROOT, "em++ ") : "em++ ";
const OPTIMIZE_FLAGS = " -Oz "; // -Oz for smallest size
const MEM = 128 * 1024 * 1024; // 64MB

const SOURCE_PATH = path.resolve(__dirname, "../emscripten/") + "/";
const OUTPUT_PATH = path.resolve(__dirname, "../build/") + "/";

const BUILD_BASE_FILENAME = "artoolkitNFT";

const BUILD_DEBUG_FILE = BUILD_BASE_FILENAME + ".debug.js";
const BUILD_WASM_FILE = BUILD_BASE_FILENAME + "_wasm.js";
const BUILD_THREAD_FILE = BUILD_BASE_FILENAME + "_thread.js";
const BUILD_WASM_EMBED_ES6_FILE = BUILD_BASE_FILENAME + "_embed_ES6_wasm.js";
const BUILD_SIMD_WASM_FILE = BUILD_BASE_FILENAME + "_wasm.simd.js";
const BUILD_WASM_ES6_FILE = BUILD_BASE_FILENAME + "_ES6_wasm.js";
const BUILD_SIMD_WASM_ES6_FILE = BUILD_BASE_FILENAME + "_ES6_wasm.simd.js";
const BUILD_WASM_ES6_TD_FILE = BUILD_BASE_FILENAME + "_ES6_wasm_td.js";
const BUILD_MIN_FILE = BUILD_BASE_FILENAME + ".min.js";

let MAIN_SOURCES = [
  "ARToolKitJS.cpp",
  "trackingMod.c",
  "trackingMod2d.c",
  "markerDecompress.c",
];

// testing threaded version of the library.
let MAIN_SOURCES_TD = [
  "ARToolKitJS_td.cpp",
  "trackingSub.c",
  "markerDecompress.c",
];

let MAIN_SOURCES_TD_ES6 = [
  "ARToolKitNFT_js_td.cpp",
  "trackingSub.c",
  "markerDecompress.c",
];

let MAIN_SOURCES_IMPROVED_ES6 = [
  "ARToolKitNFT_js.cpp",
  "trackingMod.c",
  "trackingMod2d.c",
  "markerDecompress.c",
];

if (!fs.existsSync(path.resolve(WEBARKITLIB_ROOT, "include/AR/config.h"))) {
  console.log("Renaming and moving config.h.in to config.h");
  fs.copyFileSync(
    path.resolve(WEBARKITLIB_ROOT, "include/AR/config.h.in"),
    path.resolve(WEBARKITLIB_ROOT, "include/AR/config.h"),
  );
  console.log("Done!");
}

MAIN_SOURCES = MAIN_SOURCES.map(function (src) {
  return path.resolve(SOURCE_PATH, src);
}).join(" ");

MAIN_SOURCES_TD = MAIN_SOURCES_TD.map(function (src) {
  return path.resolve(SOURCE_PATH, src);
}).join(" ");

MAIN_SOURCES_TD_ES6 = MAIN_SOURCES_TD_ES6.map(function (src) {
  return path.resolve(SOURCE_PATH, src);
}).join(" ");

MAIN_SOURCES_IMPROVED_ES6 = MAIN_SOURCES_IMPROVED_ES6.map(function (src) {
  return path.resolve(SOURCE_PATH, src);
}).join(" ");

let ar_sources, ar_sources_threaded;

if (platform === "win32") {
  const glob = require("glob");

  function match(pattern) {
    const r = glob.sync("emscripten/WebARKitLib/lib/SRC/" + pattern);
    return r;
  }
  function matchAll(patterns, prefix = "") {
    let r = [];
    for (let pattern of patterns) {
      r.push(...match(prefix + pattern));
    }
    return r;
  }

  ar_sources = matchAll([
    "AR/arLabelingSub/*.c",
    "AR/*.c",
    "ARICP/*.c",
    "ARUtil/log.c",
    "ARUtil/file_utils.c",
  ]);

  ar_sources_threaded = matchAll([
    "AR/arLabelingSub/*.c",
    "AR/*.c",
    "ARICP/*.c",
    "ARUtil/log.c",
    "ARUtil/file_utils.c",
    "ARUtil/thread_sub.c",
  ]);
} else {
  ar_sources = [
    "AR/arLabelingSub/*.c",
    "AR/*.c",
    "ARICP/*.c",
    "ARUtil/log.c",
    "ARUtil/file_utils.c",
  ].map(function (src) {
    return path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/", src);
  });

  ar_sources_threaded = [
    "AR/arLabelingSub/*.c",
    "AR/*.c",
    "ARICP/*.c",
    "ARUtil/log.c",
    "ARUtil/file_utils.c",
    "ARUtil/thread_sub.c",
  ].map(function (src) {
    return path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/", src);
  });
}

const ar2_sources = [
  "handle.c",
  "imageSet.c",
  "jpeg.c",
  "marker.c",
  "featureMap.c",
  "featureSet.c",
  "selectTemplate.c",
  "surface.c",
  "tracking.c",
  "tracking2d.c",
  "matching.c",
  "matching2.c",
  "template.c",
  "searchPoint.c",
  "coord.c",
  "util.c",
].map(function (src) {
  return path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/AR2/", src);
});

const kpm_sources = [
  "kpmHandle.cpp",
  "kpmRefDataSet.cpp",
  "kpmMatching.cpp",
  "kpmResult.cpp",
  "kpmUtil.cpp",
  "kpmFopen.c",
  "FreakMatcher/detectors/DoG_scale_invariant_detector.cpp",
  "FreakMatcher/detectors/gaussian_scale_space_pyramid.cpp",
  "FreakMatcher/detectors/gradients.cpp",
  //"FreakMatcher/detectors/harris.cpp",
  "FreakMatcher/detectors/orientation_assignment.cpp",
  "FreakMatcher/detectors/pyramid.cpp",
  "FreakMatcher/facade/visual_database_facade.cpp",
  "FreakMatcher/matchers/hough_similarity_voting.cpp",
  "FreakMatcher/matchers/freak.cpp",
  "FreakMatcher/framework/date_time.cpp",
  "FreakMatcher/framework/image.cpp",
  "FreakMatcher/framework/logger.cpp",
  "FreakMatcher/framework/timers.cpp",
].map(function (src) {
  return path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/KPM/", src);
});

const webarkit_sources = ["WebARKitLog.cpp", "../../../WebARKit/WebARKitVideoLuma.cpp"].map(function (src) {
  return path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/WebARKit/", src);
});

if (HAVE_NFT) {
  ar_sources = ar_sources
    .concat(ar2_sources)
    .concat(kpm_sources)
    .concat(webarkit_sources);

  ar_sources_threaded = ar_sources_threaded
    .concat(ar2_sources)
    .concat(kpm_sources)
    .concat(webarkit_sources);
}

let DEFINES = " ";
if (HAVE_NFT) DEFINES += " -D HAVE_NFT";
DEFINES += " -D WITH_FILTERING=" + WITH_FILTERING;

let ZLIB_FLAG = " -s USE_ZLIB=1 ";

let FLAGS = "" + OPTIMIZE_FLAGS;
FLAGS += " -Wno-warn-absolute-paths";
FLAGS += " -Wno-return-type-c-linkage"; // Add this line to disable the warning
FLAGS += " -s TOTAL_MEMORY=" + MEM + " ";
FLAGS += " -s USE_LIBJPEG=1";
//FLAGS += " -s USE_ZLIB=1";
FLAGS += ' -s EXPORTED_RUNTIME_METHODS=["FS"]';
FLAGS += " -s ALLOW_MEMORY_GROWTH=1";
FLAGS += " --bind "; // Ensure --bind is included

const FLAGS_NO_MEMORY_GROWTH = FLAGS.replace(" -s ALLOW_MEMORY_GROWTH=1", " ");

const WASM_FLAGS = " -s SINGLE_FILE=1";
const SIMD128_FLAGS = " -msimd128";
const ES6_FLAGS =
  " -s EXPORT_ES6=1 -s USE_ES6_IMPORT_META=0 -s MODULARIZE=1 -sENVIRONMENT=web ";

const ES6_TD_FLAGS =
  " -s EXPORT_ES6=1 -s USE_ES6_IMPORT_META=0 -s MODULARIZE=1 -sENVIRONMENT=web,worker ";

const ES6_EMBED_ES6_FLAGS =
  " -s EXPORT_ES6=1 -s EXPORT_NAME='ARToolkitNFT' -s MODULARIZE=1";

const PRE_FLAGS =
  " --pre-js " + path.resolve(__dirname, "../js/artoolkitNFT.api.js");

const PRE_ES6_FLAGS =
  " --pre-js " + path.resolve(__dirname, "../js/artoolkitNFT_ES6.api.js");

/* DEBUG FLAGS */
let DEBUG_FLAGS = " -g2 ";
DEBUG_FLAGS += " -s ASSERTIONS=1 ";
DEBUG_FLAGS += " --profiling ";
DEBUG_FLAGS += " -s ALLOW_MEMORY_GROWTH=1";

const INCLUDES = [
  path.resolve(__dirname, WEBARKITLIB_ROOT + "/include"),
  path.resolve(__dirname, WEBARKITLIB_ROOT + "/WebARKit/include"),
  OUTPUT_PATH,
  SOURCE_PATH,
  path.resolve(__dirname, WEBARKITLIB_ROOT + "/lib/SRC/KPM/FreakMatcher"),
]
  .map(function (s) {
    return "-I" + s;
  })
  .join(" ");

function format(str) {
  for (let f = 1; f < arguments.length; f++) {
    str = str.replace(/{\w*}/, arguments[f]);
  }
  return str;
}

function clean_builds() {
  let filePath;
  let i;
  try {
    const stats = fs.statSync(OUTPUT_PATH);
  } catch (e) {
    fs.mkdirSync(OUTPUT_PATH);
  }

  try {
    const files = fs.readdirSync(OUTPUT_PATH);
    const filesLength = files.length;
    if (filesLength > 0) {
      if (NO_LIBAR == true) {
        let noLibarFilesLength = filesLength - 4;
        for (i = 0; i < noLibarFilesLength; i++) {
          filePath = OUTPUT_PATH + "/" + files[i];
          if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
        }
      } else {
        for (i = 0; i < filesLength; i++) {
          filePath = OUTPUT_PATH + "/" + files[i];
          if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
        }
      }
    }
  } catch (e) {
    return console.log("error cleaning the build libs:", e);
  }
}

const compile_arlib = format(
  EMCC +
    INCLUDES +
    " " +
    ar_sources.join(" ") +
    FLAGS +
    ZLIB_FLAG +
    " " +
    DEFINES +
    " -r -o {OUTPUT_PATH}libar.o ",
  OUTPUT_PATH,
);

const compile_thread_arlib = format(
  EMCC +
    INCLUDES +
    " " +
    ar_sources_threaded.join(" ") +
    FLAGS +
    ZLIB_FLAG +
    " " +
    "-pthread " +
    DEFINES +
    " -r -o {OUTPUT_PATH}libar_td.o ",
  OUTPUT_PATH,
);

const compile_simd_arlib = format(
  EMCC +
    INCLUDES +
    " " +
    ar_sources.join(" ") +
    FLAGS +
    ZLIB_FLAG +
    SIMD128_FLAGS +
    " " +
    DEFINES +
    " -r -o {OUTPUT_PATH}libar_simd.o ",
  OUTPUT_PATH,
);

const ALL_BC = " {OUTPUT_PATH}libar.o ";
const THREAD_BC = " {OUTPUT_PATH}libar_td.o ";
const SIMD_BC = " {OUTPUT_PATH}libar_simd.o ";
const LIBZ_A = " {OUTPUT_PATH}libz.a ";

const configure_zlib = format(
  "emcmake cmake -B emscripten/build -S emscripten/zlib ..",
);

const build_zlib = format("cd emscripten/build && emmake make");

const copy_zlib = format(
  "cp emscripten/build/libz.a {OUTPUT_PATH}libz.a",
  OUTPUT_PATH,
);

const compile_combine = format(
  EMCC +
    INCLUDES +
    " " +
    ALL_BC +
    LIBZ_A +
    MAIN_SOURCES +
    FLAGS +
    " -s WASM=0" +
    " " +
    DEBUG_FLAGS +
    DEFINES +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_DEBUG_FILE,
);

const compile_combine_min = format(
  EMCC +
    INCLUDES +
    " " +
    ALL_BC +
    LIBZ_A +
    MAIN_SOURCES +
    FLAGS +
    " -s WASM=0" +
    " " +
    DEFINES +
    PRE_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_MIN_FILE,
);

const compile_wasm = format(
  EMCC +
    INCLUDES +
    " " +
    ALL_BC +
    LIBZ_A +
    MAIN_SOURCES +
    FLAGS +
    WASM_FLAGS +
    SIMD128_FLAGS +
    DEFINES +
    PRE_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_WASM_FILE,
);

const compile_wasm_thread = format(
  EMCC +
    INCLUDES +
    " " +
    THREAD_BC +
    LIBZ_A +
    MAIN_SOURCES_TD +
    FLAGS_NO_MEMORY_GROWTH +
    "-pthread " +
    WASM_FLAGS +
    SIMD128_FLAGS +
    DEFINES +
    PRE_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_THREAD_FILE,
);

const compile_wasm_embed_ES6 = format(
  EMCC +
    " " +
    INCLUDES +
    " " +
    ALL_BC +
    LIBZ_A +
    MAIN_SOURCES +
    FLAGS +
    WASM_FLAGS +
    DEFINES +
    ES6_EMBED_ES6_FLAGS +
    PRE_ES6_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_WASM_EMBED_ES6_FILE,
);

const compile_simd_wasm = format(
  EMCC +
    INCLUDES +
    " " +
    SIMD_BC +
    LIBZ_A +
    MAIN_SOURCES +
    FLAGS +
    WASM_FLAGS +
    SIMD128_FLAGS +
    DEFINES +
    PRE_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_SIMD_WASM_FILE,
);

const compile_wasm_es6 = format(
  EMCC +
    INCLUDES +
    " " +
    ALL_BC +
    LIBZ_A +
    MAIN_SOURCES_IMPROVED_ES6 +
    FLAGS +
    WASM_FLAGS +
    DEFINES +
    ES6_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_WASM_ES6_FILE,
);

const compile_wasm_es6_thread = format(
  EMCC +
    INCLUDES +
    " " +
    THREAD_BC +
    LIBZ_A +
    MAIN_SOURCES_TD_ES6 +
    FLAGS_NO_MEMORY_GROWTH +
    "-pthread " +
    WASM_FLAGS +
    DEFINES +
    ES6_TD_FLAGS +
    " --bind " + // Ensure --bind is included
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_WASM_ES6_TD_FILE,
);

const compile_simd_wasm_es6 = format(
  EMCC +
    INCLUDES +
    " " +
    SIMD_BC +
    LIBZ_A +
    MAIN_SOURCES_IMPROVED_ES6 +
    FLAGS +
    WASM_FLAGS +
    SIMD128_FLAGS +
    DEFINES +
    ES6_FLAGS +
    " -o {OUTPUT_PATH}{BUILD_FILE} ",
  OUTPUT_PATH,
  OUTPUT_PATH,
  OUTPUT_PATH,
  BUILD_SIMD_WASM_ES6_FILE,
);

/*
 * Run commands
 */

function onExec(error, stdout, stderr) {
  if (stdout) console.log("stdout: " + stdout);
  if (stderr) console.log("stderr: " + stderr);
  if (error !== null) {
    console.log("exec error: " + error.code);
    process.exit(error.code);
  } else {
    runJob();
  }
}

const jobs = [];

function runJob() {
  if (!jobs.length) {
    console.log("Jobs completed");
    return;
  }
  const cmd = jobs.shift();

  if (typeof cmd === "function") {
    cmd();
    runJob();
    return;
  }

  console.log("\nRunning command: " + cmd + "\n");
  exec(cmd, onExec);
}

function addJob(job) {
  jobs.push(job);
}

addJob(clean_builds);
addJob(compile_arlib);
addJob(compile_thread_arlib);
addJob(compile_simd_arlib);
addJob(configure_zlib);
addJob(build_zlib);
addJob(copy_zlib);
addJob(compile_combine);
addJob(compile_wasm);
addJob(compile_wasm_thread);
addJob(compile_wasm_embed_ES6);
addJob(compile_simd_wasm);
addJob(compile_wasm_es6);
addJob(compile_simd_wasm_es6);
addJob(compile_wasm_es6_thread);
addJob(compile_combine_min);

if (NO_LIBAR === true) {
  jobs.splice(1, 6);
}

runJob();
