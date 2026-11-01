import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'

const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const isApp = /^\/app(\/|$)/.test(window.location.pathname)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{isApp ? <App /> : <Landing />}</Suspense>
  </React.StrictMode>,
)
