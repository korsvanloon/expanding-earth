import { css } from '@emotion/react'
import CountriesSvg from '../../public/textures/countries.svg'

const Countries = () => {
  return (
    <div css={style}>
      <CountriesSvg />
    </div>
  )
}

export default Countries

const style = css`
  svg {
    padding-top: calc((1vw / 80) * 141);
    width: 100vw;
    height: auto;
  }
`
