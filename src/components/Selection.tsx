import { min, abs } from 'lib/math'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Vector2 } from 'three'
import { useSet } from 'react-use'
import clsx from 'clsx'

type State = {
  targets: HTMLElement[]
  mouseDown: boolean
  dragging: boolean
  startPoint?: Vector2
  endPoint?: Vector2
  appendMode: boolean
  selectionBox?: DOMRect
}

type Props = {
  selector: string
  onChange: (selectedElements: HTMLElement[]) => void
  children: ReactNode
}

const Selection = ({ selector, onChange, children }: Props) => {
  const selectionBoxRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>({
    targets: [],
    appendMode: false,
    mouseDown: false,
    dragging: false,
  })

  const [selected, { toggle, reset }] = useSet<HTMLElement>()

  useEffect(() => {
    setState({
      ...state,
      targets: [...containerRef.current!.querySelectorAll<HTMLElement>(selector)],
    })
  }, [])

  useEffect(() => {
    if (state.mouseDown && state.selectionBox) {
      _updateCollidingChildren(state.selectionBox)
    }
  })

  const _updateCollidingChildren = (selectionBox: DOMRect) => {
    const selected = state.targets.filter((element) => {
      const box = element?.getBoundingClientRect()
      return box && state.selectionBox && boxIntersects(box, state.selectionBox)
    })
  }

  const createSelectBox = (startPoint: Vector2, endPoint: Vector2) => {
    if (!state.mouseDown || !endPoint || !startPoint) {
      return undefined
    }
    const parentNode = selectionBoxRef.current!
    const left = min(startPoint.x, endPoint.x) - parentNode.offsetLeft
    const top = min(startPoint.y, endPoint.y) - parentNode.offsetTop
    const width = abs(startPoint.x - endPoint.x)
    const height = abs(startPoint.y - endPoint.y)

    return new DOMRect(left, top, width, height)
  }

  const onMouseMove = (e: MouseEvent) => {
    e.preventDefault()
    if (state.mouseDown) {
      const endPoint = new Vector2(e.pageX, e.pageY)
      setState({
        ...state,
        endPoint,
        selectionBox: createSelectBox(state.startPoint!, endPoint),
      })
    }
  }

  const onMouseUp = (e: MouseEvent) => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    setState({
      ...state,
      mouseDown: false,
      appendMode: false,
      dragging: false,
    })
    reset()
    onChange([...selected])
  }

  return (
    <div
      ref={containerRef}
      className={clsx('selection', state.dragging && 'dragging')}
      onClickCapture={(e) => {
        if ((e.ctrlKey || e.altKey || e.shiftKey) && e.currentTarget.id) {
          e.preventDefault()
          e.stopPropagation()
          toggle(e.currentTarget)
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 2) {
          return
        }
        setState({
          ...state,
          mouseDown: true,
          appendMode: e.ctrlKey || e.altKey || e.shiftKey,
          dragging: false,
          startPoint: new Vector2(e.pageX, e.pageY),
        })
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      }}
    >
      {children}
      <div ref={selectionBoxRef}></div>
    </div>
  )
}

export default Selection

const boxIntersects = (boxA: DOMRect, boxB: DOMRect) => {
  return (
    boxA.left <= boxB.left + boxB.width &&
    boxA.left + boxA.width >= boxB.left &&
    boxA.top <= boxB.top + boxB.height &&
    boxA.top + boxA.height >= boxB.top
  )
}
