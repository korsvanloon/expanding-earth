/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import useLocation from 'wouter/use-location'
import Debug from './Debug'
import Earth from './Earth'
import Index from './Index'

const App = () => {
  const [location] = useLocation()

  switch (location) {
    case '/debug':
      return <Debug />
    case '/earth':
      return <Earth />
    default:
      return <Index />
  }
}

export default App
