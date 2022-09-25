/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { Link } from 'wouter'
import NavBar from './NavBar'

const Index = () => {
  return (
    <div>
      <NavBar>
        <Link href="/earth">earth</Link>
        <Link href="/globe">globe</Link>
        <Link href="/map">map</Link>
        <Link href="/game">game</Link>
      </NavBar>
    </div>
  )
}

export default Index
