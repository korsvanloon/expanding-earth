import { useEffect, useState } from 'react'
import { clock } from '@/store'

/**
 * Read-outs need the current time, but not sixty times a second. Polling keeps
 * the render loop free of React entirely.
 */
export function useClockTime(hz = 12) {
  const [timeMa, setTimeMa] = useState(clock.timeMa)
  useEffect(() => {
    const id = setInterval(() => setTimeMa(clock.timeMa), 1000 / hz)
    return () => clearInterval(id)
  }, [hz])
  return timeMa
}
