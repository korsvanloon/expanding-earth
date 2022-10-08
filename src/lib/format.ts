import { floor, round } from './math'

export const formatFloat = (value: number) => value.toFixed(3).padStart(6, ' ')

export const formatInt = (value: number) => Math.round(value).toString().padStart(5, ' ')

export const formatHours = (hours: number) => `${floor(hours)}h:${round((hours % 1) * 60)}m`
