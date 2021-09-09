/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { ReactNode, ChangeEvent } from 'react'

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
    onValue(isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)

  const inputProps = { name, value, min, max, step, onChange }

  return (
    <div css={rootCss}>
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

const rootCss = css`
  display: block;
  > label > div {
    display: flex;
    align-items: center;
    > input {
      display: block;
      font-family: monospace;
      &[type='range'] {
        margin-right: 1rem;
      }
      &[type='number'] {
        min-width: 3.75rem;
      }
    }
  }
`

// RangeInput.style = rootCss
