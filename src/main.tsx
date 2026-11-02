import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'

const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const Pricing = lazy(() => import('./pricing/Pricing'))
const DemoApp = lazy(() => import('./demo/DemoApp'))
const path = window.location.pathname
const isApp = /^\/app(\/|$)/.test(path)
const isPricing = /^\/(precos|pricing)(\/|$)/.test(path)
const isDemo = /^\/demo(\/|$)/.test(path)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{isDemo ? <DemoApp /> : isApp ? <App /> : isPricing ? <Pricing /> : <Landing />}</Suspense>
  </React.StrictMode>,
)
