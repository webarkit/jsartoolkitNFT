const path = require("path");
const { ConstDependency } = require("webpack").dependencies;

// The Emscripten ES6 glue reads import.meta.url to find its own directory. A UMD
// bundle can't contain import.meta, so webpack replaces it with the file:// URL of
// build/*.js on the machine running the build, and that path ships in dist/ (#684).
// The glue never reads the directory it computes (SINGLE_FILE=1), so emit undefined
// instead. Only the emitted code changes: webpack still evaluates import.meta.url to
// the file:// URL internally, which is how it recognises
// new Worker(new URL(..., import.meta.url)) and emits the pthread worker chunk
// (a DefinePlugin would change that evaluation too, and lose the chunk).
class OmitImportMetaUrlPlugin {
  apply(compiler) {
    const name = "OmitImportMetaUrlPlugin";
    compiler.hooks.compilation.tap(
      name,
      (compilation, { normalModuleFactory }) => {
        const handler = (parser) => {
          // Runs before webpack's own ImportMetaPlugin, which would emit the file:// URL.
          parser.hooks.expression
            .for("import.meta.url")
            .tap({ name, stage: -10 }, (expr) => {
              const dep = new ConstDependency("undefined", expr.range);
              dep.loc = parser.getLocation(expr);
              parser.state.module.addPresentationalDependency(dep);
              return true;
            });
        };
        for (const type of ["javascript/auto", "javascript/esm"]) {
          normalModuleFactory.hooks.parser.for(type).tap(name, handler);
        }
      },
    );
  }
}

module.exports = (env, argv) => {
  let devtool = false;
  if (argv.mode === "development") {
    devtool = "inline-source-map";
  }
  console.log(`${argv.mode} build`);
  const module = {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-env"],
              plugins: [
                // @see https://github.com/babel/babel/issues/9849
                ["@babel/transform-runtime"],
              ],
            },
          },
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  };

  const browserPlugins = [new OmitImportMetaUrlPlugin()];

  return [
    {
      name: "default",
      devtool,
      plugins: browserPlugins,
      entry: "./src/index.ts",
      output: {
        //path: path.resolve('dist'),
        path: path.resolve(__dirname, "dist"),
        filename: "ARToolkitNFT.js",
        //library: "ARToolkitNFT",
        libraryTarget: "umd",
        // @see: https://github.com/webpack/webpack/issues/3929
        //libraryExport: "default",
        // @see: https://github.com/webpack/webpack/issues/6522
        globalObject: "typeof self !== 'undefined' ? self : this",
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        // @see https://stackoverflow.com/questions/59487224/webpack-throws-error-with-emscripten-cant-resolve-fs
        fallback: {
          fs: false,
          path: false,
          crypto: false,
        },
      },
      module,
    },
    {
      name: "simd",
      devtool,
      plugins: browserPlugins,
      entry: "./src/index_simd.ts",
      output: {
        //path: path.resolve('dist'),
        path: path.resolve(__dirname, "dist"),
        filename: "ARToolkitNFT_simd.js",
        //library: "ARToolkitNFT",
        libraryTarget: "umd",
        // @see: https://github.com/webpack/webpack/issues/3929
        //libraryExport: "default",
        // @see: https://github.com/webpack/webpack/issues/6522
        globalObject: "typeof self !== 'undefined' ? self : this",
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        // @see https://stackoverflow.com/questions/59487224/webpack-throws-error-with-emscripten-cant-resolve-fs
        fallback: {
          fs: false,
          path: false,
          crypto: false,
        },
      },
      module,
    },
    {
      name: "threaded",
      devtool,
      plugins: browserPlugins,
      entry: "./src/index_td.ts",
      output: {
        //path: path.resolve('dist'),
        path: path.resolve(__dirname, "dist"),
        filename: "ARToolkitNFT_td.js",
        chunkFilename: "[id].ARToolkitNFT_td.js", // Ensure pthread worker chunks are output
        // The chunk id changes whenever the chunk does (510 -> 602), and the old file
        // would linger in dist/ and ship with the release. Delete stale chunks, but
        // nothing else: the other three configs write to dist/ too.
        clean: {
          keep: (asset) => !/^\d+\.ARToolkitNFT_td\.js$/.test(asset),
        },
        //library: "ARToolkitNFT",
        libraryTarget: "umd",
        // @see: https://github.com/webpack/webpack/issues/3929
        //libraryExport: "default",
        // @see: https://github.com/webpack/webpack/issues/6522
        globalObject: "typeof self !== 'undefined' ? self : this",
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        // @see https://stackoverflow.com/questions/59487224/webpack-throws-error-with-emscripten-cant-resolve-fs
        fallback: {
          fs: false,
          path: false,
          crypto: false,
        },
      },
      module,
    },
    {
      name: "node",
      target: "node",
      devtool,
      entry: "./src/index_node.ts",
      output: {
        path: path.resolve(__dirname, "dist"),
        filename: "ARToolkitNFT_node.js",
        libraryTarget: "commonjs2",
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        fallback: {
          fs: false,
          path: false,
          crypto: false,
        },
      },
      module,
    },
  ];
};
