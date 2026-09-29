import { useRouterState } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import AuthGlobe from './AuthGlobe'

const ROUTES = [
  'Los Angeles → Shanghai',
  'New York → Rotterdam',
  'Rotterdam → Dubai',
  'Dubai → Singapore',
  'Singapore → Sydney',
]

type AuthLayoutProps = {
  headline?: string
  headlineEm?: string
  lede?: string
  wide?: boolean
  children: ReactNode
}

export default function AuthLayout({
  headline = 'Orders in.',
  headlineEm = 'Shipments out.',
  lede = '',
  wide = false,
  children,
}: AuthLayoutProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [routeIndex, setRouteIndex] = useState(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const timer = window.setInterval(() => {
      setRouteIndex((index) => (index + 1) % ROUTES.length)
    }, 2800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className={wide ? 'login-shell login-shell-wide' : 'login-shell'}>
      <section className="login-brand" aria-label="WMS Linker">
        <div className="login-brand-top">
          <span className="login-mark" aria-hidden="true">
            L
          </span>
          <span className="login-brand-name">Linker</span>
        </div>

        <div className="login-globe-stage">
          <AuthGlobe />
        </div>

        <div className="login-brand-copy-block">
          <h1 className="login-headline">
            {headline}
            {headlineEm ? (
              <>
                <br />
                <em>{headlineEm}</em>
              </>
            ) : null}
          </h1>
          {lede ? <p className="login-lede">{lede}</p> : null}
          <p className="login-route-row">
            <span className="login-route-dot" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.span
                key={ROUTES[routeIndex]}
                className="login-route"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                {ROUTES[routeIndex]}
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
      </section>

      <section className="login-panel">
        <motion.div
          key={pathname}
          className="login-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </section>
    </main>
  )
}
