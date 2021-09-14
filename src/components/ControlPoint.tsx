/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { pixelToUv, uvToPixel } from 'lib/image'
import { useState, PointerEvent, SVGProps } from 'react'
import { Vector2 } from 'three'

type Props = {
  uv: Vector2
  containerHeight: number
  disabled?: boolean
  color?: string
  polygonId: string
  onMove?: (uv: Vector2) => void
}

const ControlPoint = ({
  uv,
  containerHeight,
  disabled,
  onMove,
  color = 'black',
  polygonId,
  ...rest
}: Props & SVGProps<SVGCircleElement>) => {
  const [state, setState] = useState({
    active: false,
    offset: { x: 0, y: 0 },
    pixel: uvToPixel(uv, containerHeight),
    uv: uv.clone(),
  })

  const onPointerDown = (e: PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setState({
      ...state,
      active: true,
      offset: getOffset(e),
    })
  }
  const onPointerMove = (e: PointerEvent<SVGCircleElement>) => {
    if (state.active) {
      const { x, y } = getOffset(e)
      state.pixel.x -= state.offset.x - x
      state.pixel.y -= state.offset.y - y
      setState({ ...state })
    }
  }
  const onPointerUp = () => {
    setState({ ...state, active: false })
    onMove?.(pixelToUv(state.pixel, containerHeight))
  }
  const onClick = () => {
    // console.log(uv)
  }

  return (
    <circle
      {...rest}
      cx={state.pixel.x / containerHeight}
      cy={state.pixel.y / containerHeight}
      r={0.01}
      onClick={onClick}
      fill={state.active ? 'blue' : color}
      // clipPath={state.active ? undefined : `url(#${polygonId})`}
      {...(disabled ? {} : { onPointerDown, onPointerUp, onPointerMove })}
    />
  )
}
export default ControlPoint

const getOffset = (e: PointerEvent<SVGCircleElement>) => {
  const box = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - box.left
  const y = e.clientY - box.top
  return { x, y }
}
