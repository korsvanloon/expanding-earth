import areNukeCsv from './area-nukes.csv'

export const areaNukes = areNukeCsv as AreaNuke[]

type AreaNuke = {
  name: string
  lat: number
  lng: number
  active: number
  reserve: number
  country: string
}
