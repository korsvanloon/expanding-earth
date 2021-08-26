import { useState, PointerEvent } from 'react'
import { Vector2 } from 'three'

type Props = {
  uv: Vector2
  containerHeight: number
  disabled?: boolean
  onMove?: (uv: Vector2) => void
}

const ControlPoint = ({ uv, containerHeight, disabled, onMove }: Props) => {
  const [state, setState] = useState({
    active: false,
    offset: { x: 0, y: 0 },
  })

  const onPointerDown = (e: PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setState({
      ...state,
      active: true,
      offset: getOffset(e, containerHeight),
    })
  }
  const onPointerMove = (e: PointerEvent<SVGCircleElement>) => {
    if (state.active) {
      const { x, y } = getOffset(e, containerHeight)
      uv.x = uv.x - (state.offset.x - x)
      uv.y = uv.y - (state.offset.y - y)
      setState({ ...state })
    }
  }
  const onPointerUp = () => {
    setState({ ...state, active: false })
    onMove?.(uv)
  }
  const onClick = () => {
    // console.log(uv)
  }

  return (
    <circle
      cx={uv.x * 2}
      cy={uv.y}
      r={0.005}
      onClick={onClick}
      fill={state.active ? 'blue' : 'black'}
      {...(disabled ? {} : { onPointerDown, onPointerUp, onPointerMove })}
    />
  )
}
export default ControlPoint

const getOffset = (e: PointerEvent<SVGCircleElement>, height: number) => {
  const box = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - box.left) / height / 2
  const y = (e.clientY - box.top) / height
  return { x, y }
}
