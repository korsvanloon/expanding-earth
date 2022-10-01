// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
import { createRoot } from 'react-dom/client'
import App from './components/App'
import reportWebVitals from './reportWebVitals'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <div>
    <App />
  </div>,
  // <React.StrictMode>{/* <App /> */}</React.StrictMode>,
)

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()

/**
 *
 */
;(window as any).backup = () => {
  const raw = localStorage.getItem('plates')
  if (raw) {
    localStorage.setItem('plates-' + new Date().toISOString(), raw)
    try {
      return JSON.parse(raw)
    } catch {}
  }
  return null
}
;(window as any).store = (name: string) => {
  const polygons = (window as any).polygons
  if (polygons) localStorage.setItem(name, JSON.stringify(polygons))
}
