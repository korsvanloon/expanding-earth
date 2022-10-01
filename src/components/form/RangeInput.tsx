import { clamp } from 'lib/math'
import { ReactNode, ChangeEvent } from 'react'
import classes from './RangeInput.module.css'

type Props = {
  name: string
  value: number
  onValue: (v: number) => void
  min?: number
  max?: number
  step?: number
  children: ReactNode
}

function RangeInput({ name, step = 0.1, min = 0, max = 1, value, children, onValue }: Props) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    onValue(isNaN(e.target.valueAsNumber) ? min : clamp(e.target.valueAsNumber, min, max))

  const inputProps = { name, value, min, max, step, onChange }

  return (
    <div className={classes.root}>
      <label htmlFor={name}>
        <span>{children}</span>
        <div>
          <input type="range" {...inputProps} />
          <input type="number" id={name} {...inputProps} />
        </div>
      </label>
    </div>
  )
}

export default RangeInput
