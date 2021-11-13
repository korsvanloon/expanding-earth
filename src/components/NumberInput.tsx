// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { useEffect, useState } from 'react'

type Props = {
  value: number
  min?: number
  max?: number
  step?: number
  required?: boolean
  onChange: (value: number) => void
  children?: React.ReactNode
}

const NumberInput = ({ value, min = 0, max, step, required = true, onChange, children }: Props) => {
  const [innerValue, setInnerValue] = useState(value)
  useEffect(() => {
    setInnerValue(value)
  }, [value])
  return (
    <label>
      <span>{children}</span>
      <input
        type="number"
        onChange={(e) => {
          setInnerValue(e.target.valueAsNumber)
          if (e.target.value) {
            return onChange(e.target.valueAsNumber)
          }
        }}
        value={innerValue}
        required={required}
        min={min}
        max={max}
        step={step ?? 'any'}
      />
    </label>
  )
}

export default NumberInput
