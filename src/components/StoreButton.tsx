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
    const data = load<T>(name)
    if (data) onLoad(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button
      {...props}
      onClick={() => {
        localStorage.setItem(name, JSON.stringify(onSave()))
      }}
    >
      {children}
    </button>
  )
}

export default StoreButton

export function load<T>(name: string) {
  const raw = localStorage.getItem(name)
  if (raw)
    try {
      return JSON.parse(raw) as T
    } catch (e) {
      console.error(e)
    }
  return undefined
}
