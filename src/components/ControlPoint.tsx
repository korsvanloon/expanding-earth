/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { pixelToUv, uvToPixel } from 'lib/image'
import { useState, PointerEvent, SVGProps, useEffect } from 'react'
import { Vector2 } from 'three'

type Props = {
  uv: Vector2
  containerHeight: number
  disabled?: boolean
  color?: string
  polygonId: string
  onMove?: (uv: Vector2, event: PointerEvent<SVGCircleElement>) => void
  onClick?: (uv: Vector2, event: PointerEvent<SVGCircleElement>) => void
}

const ControlPoint = ({
  uv,
  containerHeight,
  disabled,
  onMove,
  onClick,
  color = 'white',
  polygonId,
  ...rest
}: Props & Omit<SVGProps<SVGCircleElement>, keyof Props>) => {
  const [state, setState] = useState({
    active: false,
    moved: false,
    offset: { x: 0, y: 0 },
    pixel: uvToPixel(uv, containerHeight),
  })

  useEffect(
    () =>
      setState({
        active: false,
        moved: false,
        offset: { x: 0, y: 0 },
        pixel: uvToPixel(uv, containerHeight),
      }),
    [containerHeight],
  )

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
      setState({ ...state, moved: true })
    }
  }
  const onPointerUp = (event: PointerEvent<SVGCircleElement>) => {
    if (state.moved) {
      onMove?.(pixelToUv(state.pixel, containerHeight), event)
    } else {
      onClick?.(uv, event)
    }
    setState({ ...state, active: false, moved: false })
  }

  return (
    <circle
      {...rest}
      cx={state.pixel.x / containerHeight}
      cy={state.pixel.y / containerHeight}
      r={0.015}
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
