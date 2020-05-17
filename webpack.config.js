const path = require('path');

module.exports = {
  entry: './src_es6/index.js',
  output: {
    path: path.resolve('dist'),
    filename: 'ARToolkitNFT_ES6.js',
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
        test: /\.js?$/,
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
        }]
      },
    ],
  },
  resolve: {
    extensions: ['.js']
  },
  // @see https://stackoverflow.com/questions/59487224/webpack-throws-error-with-emscripten-cant-resolve-fs
  node: {
    'fs': 'empty'
  }
};
