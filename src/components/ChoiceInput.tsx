import { css } from '@emotion/react'
import { ReactNode } from 'react'

type Props = {
  name: string
  value: string
  options: { value: string; label: string }[]
  onValue: (v: string) => void
  children: ReactNode
}

function ChoiceInput({ name, options, value, children, onValue }: Props) {
  return (
    <div css={rootCss}>
      {children}
      <div>
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onValue(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  )
}

export default ChoiceInput

const rootCss = css`
  label {
    display: inline-flex;
    align-items: center;
    margin-right: 1em;
  }
`
