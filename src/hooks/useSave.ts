import { useState } from 'react'

declare global {
  interface Window {
    state: Record<string, any>
  }
}
window.state = {}

export function useSave<S>(saveName: string, fallback: S, loader: (data: any) => S = (d) => d) {
  const [state, setState] = useState(loader(load(saveName, fallback)))
  const save = (p: Partial<S>) => {
    const newState = fallback instanceof Array ? (p as S) : { ...state, ...p }
    setState(newState)
    localStorage.setItem(saveName, JSON.stringify(newState))
    window.state[saveName] = newState
  }
  return [state, save] as const
}

const load = <T>(saveName: string, fallback: T) =>
  JSON.parse(localStorage.getItem(saveName) ?? JSON.stringify(fallback)) as T

const cssPath = (element: Element) => {
  const path = []
  let el = element
  while (el.parentElement) {
    let selector = el.nodeName.toLowerCase()
    if (el.id) {
      selector += '#' + el.id
      path.unshift(selector)
      break
    } else {
      const nth = [...(el.parentElement?.children ?? [])].indexOf(el)
      if (nth > 1) selector += ':nth-of-type(' + nth + ')'
    }
    path.unshift(selector)
    el = el.parentElement
  }
  return path.join(' > ')
}

window.addEventListener('DOMContentLoaded', () => {
  const path = localStorage.getItem('active')
  if (path) {
    document.querySelector<HTMLButtonElement | HTMLInputElement>(path)?.focus()
  }
})
window.addEventListener('close', () => {
  if (document.activeElement) {
    localStorage.setItem('active', cssPath(document.activeElement))
  } else {
    localStorage.removeItem('active')
  }
})
