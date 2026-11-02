import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './styles/fonts.css'

const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const Pricing = lazy(() => import('./pricing/Pricing'))
const PublicLayout = lazy(() => import('./marketing/PublicLayout'))
const LegalPage = lazy(() => import('./legal/LegalPage'))
const DemoApp = lazy(() => import('./demo/DemoApp'))
const path = window.location.pathname
const isApp = /^\/app(\/|$)/.test(path)
const isPricing = /^\/(precos|pricing)(\/|$)/.test(path)
const isLegal = /^\/(legal|privacidade|lgpd|cookies|reembolso|termos-de-uso)\/?$/.test(path)
const isDemo = /^\/demo(\/|$)/.test(path)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{isDemo ? <DemoApp /> : isApp ? <App /> : <PublicLayout>{isLegal ? <LegalPage /> : isPricing ? <Pricing /> : <Landing />}</PublicLayout>}</Suspense>
  </React.StrictMode>,
)
