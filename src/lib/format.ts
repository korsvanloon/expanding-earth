export const formatFloat = (value: number) => value.toFixed(3).padStart(6, ' ')
export const formatInt = (value: number) => Math.round(value).toString().padStart(5, ' ')
