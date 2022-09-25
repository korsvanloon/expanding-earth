/** @jsx jsx */
import { jsx } from '@emotion/react'
import useLocation from 'wouter/use-location'
import EarthMap from './EarthMap'
import Earth from './Earth'
import Globe from './Globe'
import Index from './Index'
import Game from './Game'

const App = () => {
  const [location] = useLocation()

  switch (location) {
    case '/map':
      return <EarthMap />
    case '/earth':
      return <Earth />
    case '/game':
      return <Game />
    case '/globe':
      return <Globe />
    default:
      return <Index />
  }
}

export default App
