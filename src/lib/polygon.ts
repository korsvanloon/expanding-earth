import { Vector2 } from 'three'
import { pipeInto } from 'ts-functional-pipe'
import { getHighest, getLowest, where } from './iterable'

export type PointsInTime = {
  time: number
  points: Vector2[]
}

export type Polygon = {
  points: Vector2[]
  timeline?: PointsInTime[]
}

export const getPointsAtTime = ({ points, timeline }: Polygon, time: number) => {
  const zeroPoints = { time: 0, points }
  const lower = timeline
    ? pipeInto(
        timeline,
        where((p) => p.time <= time),
        getHighest((p) => p.time),
      ) ?? zeroPoints
    : zeroPoints

  const upper = timeline
    ? pipeInto(
        timeline,
        where((p) => p.time >= time),
        getLowest((p) => p.time),
      ) ?? lower
    : lower

  const alpha = (time - lower.time) / (upper.time - lower.time || 1)

  return lower.points.map((point, i) => point.clone().lerp(upper.points[i], alpha))
}

export const setPointsAtTime = (polygon: Polygon, time: number, points: Vector2[]) => {
  if (time === 0) {
    polygon.points = points
    return
  }

  if (!polygon.timeline) polygon.timeline = []
  const pointsAtTime = polygon.timeline.find((t) => t.time === time)
  if (pointsAtTime) {
    pointsAtTime.points = points
  } else {
    polygon.timeline.push({ time, points })
  }
  // polygon.timeline.sort((a, b) => a.time - b.time)
}

export const polygonFromRawJson = ({ points, timeline }: Polygon, i = 0) => ({
  points: points.map(asVector),
  timeline: timeline?.map(({ points, time }) => ({
    time,
    points: points.map(asVector),
  })),
})

const asVector = (v: { x: number; y: number }) => new Vector2(v.x, v.y)
