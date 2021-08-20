export const sum = <T>(list: T[], getValue: (item: T) => number) =>
  list.reduce((total, item) => total + getValue(item), 0)

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))
export const clamp01 = (value: number) => clamp(value, 0, 1)
