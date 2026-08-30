import { useState } from 'react'

export const useUpdate = <T>(initial: T) => {
  const [state, setState] = useState<T>(initial)
  const updateState = (update: Partial<T>) => setState((s) => ({ ...s, ...update }))
  return [state, updateState] as const
}
