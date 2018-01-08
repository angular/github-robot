const path = require('path');
const fs = require('fs');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function(x) {
    // filter probot dependencies because we want to compile/bundle them with babel for node 6
    return [
      '.bin',
      'probot'
    ].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

module.exports = {
  entry: './libs/probot.ts',
  target: "node",
  externals: nodeModules,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: "tsconfig.probot.json"
          }
        }]
      },
      {
        test: /\.js?$/,
        use: [{
          loader: 'babel-loader',
          options: {
            presets: [
              ["env", {targets: {"node": "6.11"}}]
            ]
          }
        }]
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    libraryTarget: 'commonjs',
    filename: 'lib/index.js',
    path: path.resolve(__dirname, 'functions/libs/probot')
  },
  plugins: [CopyWebpackPlugin(['node_modules/probot/package.json'])]
};
