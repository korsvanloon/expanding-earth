import { useEffect, useState } from 'react'
import main from '../lib/earth'

const Earth = () => {
  const [age, setAge] = useState(0)
  useEffect(() => {
    const result = main(setAge)
    return () => {
      result.then((r) => r())
    }
  }, [])

  return (
    <>
      <div id="container" style={{ width: '100vw', height: '100vh' }}></div>
      <pre style={{ position: 'absolute', background: 'gray', top: 0 }}>{age.toFixed(4)}</pre>
    </>
  )
}

export default Earth
