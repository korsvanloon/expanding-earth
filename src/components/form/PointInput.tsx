// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { Vector2 } from 'three'
import NumberInput from './NumberInput'

type Props = {
  value: Vector2
  onChange: (value: Vector2) => void
  step?: number
  minX?: number
  maxX?: number
  minY?: number
  maxY?: number
}

const PointInput = ({
  value: point,
  step = 0.001,
  minX = 0,
  maxX = 1,
  minY = 0,
  maxY = 1,
  onChange,
}: Props) => (
  <div css={style}>
    <NumberInput
      min={minX}
      max={maxX}
      step={step}
      value={point.x}
      onChange={(value) => {
        point.setX(value)
        onChange(point)
      }}
    >
      x
    </NumberInput>
    <NumberInput
      min={minY}
      max={maxY}
      step={step}
      value={point.y}
      onChange={(value) => {
        point.setY(value)
        onChange(point)
      }}
    >
      y
    </NumberInput>
  </div>
)

export default PointInput

const style = css`
  display: inline-flex;
  label {
    padding: 0 1rem;
  }
  span {
    padding: 0.5rem;
  }
`
