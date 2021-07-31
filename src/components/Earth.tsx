import { useEffect } from 'react'
import main from '../lib/textureDebug'

const App = () => {
  useEffect(() => {
    const result = main()
    return () => {
      result.then((r) => r())
    }
  }, [])
  return (
    <>
      <div id="container" style={{ width: '100vw', height: '100vh' }}></div>
      {/* <Controls /> */}
    </>
  )
}

export default App
