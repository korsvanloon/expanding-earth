const Papa = require('papaparse')
// const { transform } = require('@babel/core')
// const jestPreset = require('babel-preset-jest')

module.exports = {
  process(fileContent) {
    const [header, ...data] = Papa.parse(fileContent).data
    const result = data
      .filter((x) => x[0]) // ignore empty lines
      .map((line) => Object.fromEntries(line.map((v, i) => [header[i], v])))
    return 'module.exports = ' + JSON.stringify(result) + ';'
  },
}
