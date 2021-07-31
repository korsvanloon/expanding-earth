export const sum = <T>(list: T[], getValue: (item: T) => number) =>
  list.reduce((total, item) => total + getValue(item), 0)
