import { AnimationLoop } from 'hooks/useAnimationLoop'
import { useEffect } from 'react'

export const useShortCuts = ({ start, stop, running }: AnimationLoop) => {
  useEffect(() => {
    const shortCuts = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body) return
      event.preventDefault()
      switch (event.key) {
        case ' ':
          if (running) stop()
          else start()
          break
      }
    }
    window.addEventListener('keyup', shortCuts)
    return () => window.removeEventListener('keyup', shortCuts)
  }, [running, start, stop])
}
