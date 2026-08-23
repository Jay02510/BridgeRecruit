const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const devCerts = require('office-addin-dev-certs');

const DEV_SERVER_PORT = 3001;

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const isDev = options.mode === 'development';

  return {
    devtool: isDev ? 'source-map' : false,
    entry: {
      taskpane: './src/taskpane/taskpane.ts',
      dialog: './src/dialog/dialog.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: 'ts-loader',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'taskpane.html',
        template: './src/taskpane/taskpane.html',
        chunks: ['taskpane'],
      }),
      new HtmlWebpackPlugin({
        filename: 'dialog.html',
        template: './src/dialog/dialog.html',
        chunks: ['dialog'],
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: 'assets', to: 'assets' }],
      }),
    ],
    devServer: {
      headers: { 'Access-Control-Allow-Origin': '*' },
      server: {
        type: 'https',
        options: isDev ? await getHttpsOptions() : {},
      },
      port: DEV_SERVER_PORT,
    },
  };
};
