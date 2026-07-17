/**
 * React 应用入口
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.js'
import './styles/global.css'
import './i18n/i18n.js'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
