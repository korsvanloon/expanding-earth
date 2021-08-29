/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { ButtonHTMLAttributes, ReactNode, useEffect } from 'react'

type Props<T> = {
  name: string
  onLoad: (i: T) => void
  onSave: () => T
  children: ReactNode
}

function StoreButton<T>({
  name,
  onLoad,
  onSave,
  children,
  ...props
}: Props<T> & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Props<T>>) {
  useEffect(() => {
    const raw = localStorage.getItem(name)
    if (raw)
      try {
        onLoad(JSON.parse(raw) as T)
      } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <button
        {...props}
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
