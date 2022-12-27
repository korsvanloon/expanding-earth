import { LatLng } from 'lib/type'
import areNukeCsv from './area-nukes.csv'
// import colorToCountry from './color-area.json'
import scenarioCsv from './scenario.csv'
import areasCsv from './areas.csv'
import citiesCsv from './cities.csv'
import { PI } from 'lib/math'

// export { colorToCountry }

export const cities = citiesCsv.map<City>(({ name, country, lng, lat, population }) => ({
  name,
  country,
  latLng: { x: (lng * PI) / 180, y: (lat * PI) / 180 },
  population,
}))

export type City = {
  name: string
  country: string
  latLng: LatLng
  population: number
}

export const areas = areasCsv.map<Area>(({ name, color, population }) => ({
  name,
  color,
  population,
}))

export type Area = {
  name: string
  color: string
  population: number
}

export const areaNukes = areNukeCsv.map<AreaNuke>(
  ({ name, lng, lat, active, reserve, country }) => ({
    name,
    active,
    reserve,
    country,
    latLng: { x: lng, y: lat },
  }),
) as AreaNuke[]

type AreaNuke = {
  name: string
  latLng: LatLng
  active: number
  reserve: number
  country: string
}

export const nukePlan = scenarioCsv.map<MovementPathObject<Nuke>>(
  ({ origin, destination, speed, start, amount, type }) => ({
    movementPath: {
      origin: (areaNukes.find((a) => a.name === origin) ?? throwMessage(origin))?.latLng,
      destination: (areaNukes.find((a) => a.name === destination) ?? throwMessage(destination))
        ?.latLng,
      speed,
      startTime: start,
    },
    object: {
      origin,
      amount,
      type,
    },
  }),
)

export type MovementPathObject<T> = {
  // currentPosition: LatLng
  movementPath: MovementPath
  object: T
}

export type MovementPath = {
  origin: LatLng
  destination: LatLng
  /** In km/h */
  speed: number
  /** In hours */
  startTime: number
}

export type Nuke = {
  origin: string
  amount: number
  type: 'missile' | 'gravity'
}

export type FlyingSaucer = {
  number: number
  amount: number
}

const throwMessage = (message: string) => {
  throw new Error(message)
}
