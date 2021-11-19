import { clamp01 } from 'lib/math'
import { useState, useRef } from 'react'

export const useAnimationLoop = (initialTime = 0, endTime = 1) => {
  const [time, setTime] = useState(initialTime)
  const [running, setRunning] = useState(false)

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef<number>()
  const previousTRef = useRef<number>()
  const ascendingRef = useRef<boolean>(false)

  const animate = (t: number) => {
    if (previousTRef.current !== undefined) {
      const deltaTime = t - previousTRef.current

      // const approxTime = time + deltaTime * 0.0001 * (ascending ? 1 : -1))

      // Pass on a function to the setter of the state
      // to make sure we always have the latest state
      setTime((prevCount) => {
        const t = clamp01(prevCount + deltaTime * 0.0001 * (ascendingRef.current ? 1 : -1))
        if (t >= endTime) {
          ascendingRef.current = false
        } else if (t <= 0) {
          ascendingRef.current = true
        }
        return t
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
