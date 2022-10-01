import { ReactNode } from 'react'
import classes from './ChoiceInput.module.css'

type Props = {
  name: string
  value: string
  options: { value: string; label: string }[]
  onValue: (v: string) => void
  children: ReactNode
}

function ChoiceInput({ name, options, value, children, onValue }: Props) {
  return (
    <div className={classes.root}>
      <label htmlFor={name}>{children}</label>
      <select id={name} name={name} value={value} onChange={(e) => onValue(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ChoiceInput
