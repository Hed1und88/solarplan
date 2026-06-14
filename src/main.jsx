import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

if (typeof window !== 'undefined') {
  try {
    Object.keys(window.localStorage || {}).forEach(key => {
      if (key.startsWith('solarplan:project:') && key.endsWith(':solar_roof_planner_data')) {
        window.localStorage.removeItem(key)
      }
    })
  } catch {}
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
