import { MovementPathObject, Nuke, nukePlan } from 'data'
import { Point3D } from './type'

export const a = 1

/*
initial state
every 0.01 time save delta
current state =
*/
export type GameState = {
  nukePlan: Agent<Nuke>[]
}

export type Agent<T> = MovementPathObject<T> & {
  captured: boolean
  currentPosition?: Point3D
}

export type Event = {
  time: number
}

// export type LaunchNukeEvent = Event & {}
// export type LaunchNukeEvent = Event & {}
