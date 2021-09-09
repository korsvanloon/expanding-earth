// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

const NavBar = ({ children }: Props) => {
  return <div css={style}>{children}</div>
}

export default NavBar

const style = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* padding: 0.5rem; */
  > * {
    margin: 0.5rem;
  }
  button,
  a {
    height: 3rem;
    height: 3rem;
    min-width: 100px;
    text-align: middle;
    display: flex;
    justify-content: center;
    align-items: center;
  }
`
