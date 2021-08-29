/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { ReactNode, useEffect } from 'react'

type Props<T> = {
  name: string
  onLoad: (i: T) => void
  onSave: () => T
  children: ReactNode
}

function StoreButton<T>({ name, onLoad, onSave, children }: Props<T>) {
  useEffect(() => {
    const raw = localStorage.getItem(name)
    if (raw)
      try {
        onLoad(JSON.parse(raw) as T)
      } catch {}
  }, [])

  return (
    <div>
      <button
        onClick={() => {
          localStorage.setItem(name, JSON.stringify(onSave()))
        }}
      >
        {children}
      </button>
    </div>
  )
}

export default StoreButton
