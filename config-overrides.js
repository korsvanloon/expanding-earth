/**
 * 
 * @param {import('webpack').Configuration} config 
 * @param {*} env 
 * @returns 
 */
module.exports = function override(config, env) {
  console.log(config.module)
  config.module?.rules.push({
    test: /\.(glsl|vs|fs)$/,
    loader: 'ts-shader-loader'
  })
  return config;
}