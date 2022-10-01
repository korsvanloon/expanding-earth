import { clamp } from 'lib/math'
import { useState, useRef } from 'react'

export const useAnimationLoop = ({
  startTime = 0,
  endTime = 1,
  step = 0.0001,
  speed = 0,
  startOver = false,
}: {
  startTime?: number
  endTime?: number
  step?: number
  speed?: number
  startOver?: boolean
} = {}) => {
  const [time, setTime] = useState(startTime)
  const [running, setRunning] = useState(false)

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef<number>()
  const previousTRef = useRef<number>()
  const ascendingRef = useRef<boolean>(false)

  const animate = (t: number) => {
    if (previousTRef.current !== undefined) {
      const deltaTime = t - previousTRef.current

      // Pass on a function to the setter of the state
      // to make sure we always have the latest state
      setTime((prevCount) => {
        const t = clamp(
          prevCount + deltaTime * step * (ascendingRef.current ? 1 : -1),
          startTime,
          endTime,
        )
        if (startOver) {
          return t >= endTime ? 0 : t
        } else {
          if (t >= endTime) {
            ascendingRef.current = false
          } else if (t <= startTime) {
            ascendingRef.current = true
          }
          return t
        }
      })
    }
    previousTRef.current = t
    requestRef.current = requestAnimationFrame(animate)
  }
  const start = () => {
    requestRef.current = requestAnimationFrame(animate)
    setRunning(true)
  }

  const stop = () => {
    cancelAnimationFrame(requestRef.current!)
    previousTRef.current = undefined
    setRunning(false)
  }

  return { time, setTime, running, stop, start }
}
