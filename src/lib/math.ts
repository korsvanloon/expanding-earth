export const sumBy = <T>(list: T[], getValue: (item: T) => number) => sum(list.map(getValue))
export const sum = (list: number[]) => list.reduce((total, value) => total + value, 0)

export const clamp = (value: number, minValue: number, maxValue: number) =>
  max(minValue, min(maxValue, value))

export const clamp01 = (value: number) => clamp(value, 0, 1)

export const inRange = (value: number, minValue: number, maxValue: number) =>
  value >= minValue && value <= maxValue

export const findMax = <T>(input: T[], callback: (item: T) => number) =>
  input.reduce((p, c) => (callback(c) > callback(p) ? c : p))

export const findMin = <T>(input: T[], callback: (item: T) => number) =>
  input.reduce((p, c) => (callback(c) < callback(p) ? c : p))

export const range = (length: number) => Array.from({ length }, (_, i) => i)

const {
  E,
  LN10,
  LN2,
  LOG10E,
  LOG2E,
  PI,
  SQRT1_2,
  SQRT2,
  abs,
  acos,
  acosh,
  asin,
  asinh,
  atan,
  atan2,
  atanh,
  cbrt,
  ceil,
  clz32,
  cos,
  cosh,
  exp,
  expm1,
  floor,
  fround,
  hypot,
  imul,
  log,
  log10,
  log1p,
  log2,
  max,
  min,
  pow,
  random,
  round,
  sign,
  sin,
  sinh,
  sqrt,
  tan,
  tanh,
  trunc,
} = Math
export {
  E,
  LN10,
  LN2,
  LOG10E,
  LOG2E,
  PI,
  SQRT1_2,
  SQRT2,
  abs,
  acos,
  acosh,
  asin,
  asinh,
  atan,
  atan2,
  atanh,
  cbrt,
  ceil,
  clz32,
  cos,
  cosh,
  exp,
  expm1,
  floor,
  fround,
  hypot,
  imul,
  log,
  log10,
  log1p,
  log2,
  max,
  min,
  pow,
  random,
  round,
  sign,
  sin,
  sinh,
  sqrt,
  tan,
  tanh,
  trunc,
}
