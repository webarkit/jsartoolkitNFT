const path = require('path');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  output: {
    //path: path.resolve('dist'),
    path: path.resolve(__dirname, 'dist'),
    filename: 'ARToolkitNFT.js',
    library: 'ARToolkitNFT',
    libraryTarget: 'umd',
    // @see: https://github.com/webpack/webpack/issues/3929
    libraryExport: 'default',
    // @see: https://github.com/webpack/webpack/issues/6522
    globalObject: 'typeof self !== \'undefined\' ? self : this',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              // @see https://github.com/babel/babel/issues/9849
              ['@babel/transform-runtime']
            ]
          }
        },
        {
          loader: 'ts-loader',
        }
      ]
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    // @see https://stackoverflow.com/questions/59487224/webpack-throws-error-with-emscripten-cant-resolve-fs
    fallback: {
      fs: false,
      path: false,
      crypto: false,
    }
  },
};
