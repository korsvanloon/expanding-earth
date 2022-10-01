import { useEffect, useRef, useState } from 'react'
import classes from './TextInput.module.css'

type Props = {
  value: string
  required?: boolean
  onChange: (value: string) => void
  children?: React.ReactNode
}

const TextInput = ({ value, required = true, onChange, children }: Props) => {
  const [innerValue, setInnerValue] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const target = ref.current
    if (target) {
      target.style.minWidth = `${value.length * 0.5 + 2}rem`
    }
    setInnerValue(value)
  }, [value])
  return (
    <label className={classes.root}>
      <span>{children}</span>
      <input
        ref={ref}
        type="text"
        onChange={({ target }) => {
          target.style.minWidth = `${target.value.length * 0.5 + 2}rem`
          setInnerValue(target.value)
          if (target.value) {
            return onChange(target.value)
          }
        }}
        value={innerValue}
        required={required}
      />
    </label>
  )
}

export default TextInput
