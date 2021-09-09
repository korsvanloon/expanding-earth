/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { Link } from 'wouter'

const Index = () => {
  return (
    <main>
      <Link href="/earth">earth</Link>
      <Link href="/globe">globe</Link>
      <Link href="/map">map</Link>
    </main>
  )
}

export default Index
