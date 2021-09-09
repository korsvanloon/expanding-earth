import path from 'path'
import webpack from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin'
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin'
import ReactRefreshTypeScript from 'react-refresh-typescript'
import devServer from 'webpack-dev-server'

const isDevelopment = process.env.NODE_ENV !== 'production'

const webpackConfig = (
  env: any,
): webpack.Configuration & { devServer: devServer.Configuration } => ({
  entry: './src/index.tsx',
  target: isDevelopment ? 'web' : 'browserslist',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    plugins: [new TsconfigPathsPlugin()],
  },
  output: {
    path: path.join(__dirname, '/dist'),
    filename: 'build.js',
  },
  devServer: {
    contentBase: path.join(__dirname, 'public'),
    historyApiFallback: true,
    hot: true,
  },
  mode: isDevelopment ? 'development' : 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        // exclude: /dist/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('ts-loader'),
            options: {
              getCustomTransformers: () => ({
                before: [isDevelopment && ReactRefreshTypeScript()].filter(Boolean),
              }),
              transpileOnly: isDevelopment,
            },
          },
          // {
          //   loader: require.resolve('babel-loader'),
          //   options: {
          //     plugins: [isDevelopment && require.resolve('react-refresh/babel')].filter(Boolean),
          //   },
          // },
        ],
      },
      {
        test: /\.(glsl|vs|fs)$/,
        loader: 'ts-shader-loader',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    new webpack.DefinePlugin({
      'process.env.PRODUCTION': env.production || !env.development,
      'process.env.NAME': JSON.stringify(require('./package.json').name),
      'process.env.VERSION': JSON.stringify(require('./package.json').version),
    }),
    new ForkTsCheckerWebpackPlugin({
      // eslint: {
      //   files: './src/**/*.{ts,tsx,js,jsx}', // required - same as command `eslint ./src/**/*.{ts,tsx,js,jsx} --ext .ts,.tsx,.js,.jsx`
      // },
    }),
    ...(isDevelopment
      ? [new webpack.HotModuleReplacementPlugin(), new ReactRefreshWebpackPlugin()]
      : []),
  ].filter(isValue),
})

export default webpackConfig

const isValue = <T>(input: T): input is NonNullable<T> => input !== undefined && input !== null
