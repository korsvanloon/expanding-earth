// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { Vector2 } from 'three'
import NumberInput from './form/NumberInput'

type Props = {
  value: Vector2
  onChange: (value: Vector2) => void
}

const PointInput = ({ value: point, onChange }: Props) => (
  <div css={style}>
    <NumberInput
      max={1}
      step={0.001}
      value={point.x}
      onChange={(value) => {
        point.setX(value)
        onChange(point)
      }}
    >
      x
    </NumberInput>
    <NumberInput
      max={1}
      step={0.001}
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
