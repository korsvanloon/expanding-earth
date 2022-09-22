// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  required?: boolean
  onChange: (value: string) => void
  children?: React.ReactNode
}

const minWidth = 6

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
    <label css={style}>
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

const style = css`
  padding: 0 1rem;
  input {
    /* min-width: ${minWidth}rem;
    width: 100%; */
  }
`
