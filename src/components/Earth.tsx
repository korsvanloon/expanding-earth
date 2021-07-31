import { useEffect, useState } from 'react'
import main from '../lib/textureDebug'

const App = () => {
  const [once, setOnce] = useState(true)

  useEffect(() => {
    if (once) {
      main()
      setOnce(false)
    }
  }, [once])
  return (
    <>
      <div id="container" style={{ width: '100vw', height: '100vh' }}></div>
      {/* <Controls /> */}
    </>
  )
}

export default App
