import useLocation from 'wouter/use-location'
import EarthMap from './EarthMap'
import Earth from './Earth'
import Globe from './Globe'
import Index from './Index'
import Game from './game/Game'
import Countries from './Countries'

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
    case '/countries':
      return <Countries />
    default:
      return <Index />
  }
}

export default App
