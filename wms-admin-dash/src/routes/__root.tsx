import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import AuthLayout from '../components/AuthLayout'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { useEffect } from 'react'

// Side-effect imports avoid Vite 8 / Rolldown `?url` → `?transform-only` path failures on Windows.
import '../styles/theme.css'
import '../styles.css'
import '../styles/portal-v2.css'
import '../styles/order-detail-refresh.css'
import '../styles/order-flow.css'
import '../styles/order-diagram.css'
import '../styles/order-cockpit.css'
import '../styles/auth.css'
import '../styles/theme-controls.css'
import { ADMIN_CONSOLE_PATH } from '../lib/config'
import { THEME_INIT_SCRIPT } from '../lib/theme'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'WMS Linker',
      },
    ],
    links: [
      { rel: 'icon', href: '/SVG-ICon.ico', type: 'image/x-icon' },
      { rel: 'apple-touch-icon', href: '/logo.svg' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundScreen,
})

function NotFoundScreen() {
  return (
    <AuthLayout
      headline="This aisle"
      headlineEm="does not exist."
      lede="Head back to the start. There is nothing to see on unknown routes."
    >
      <p className="login-card-kicker">Missing page</p>
      <h2 className="login-title">Lost the map?</h2>
      <p className="login-subtitle">The link is invalid or this page was moved.</p>
      <a className="login-submit home-cta" href="/">
        Return home
      </a>
    </AuthLayout>
  )
}

function RootComponent() {
  useEffect(() => {
    // Retire the removed offline feature for browsers that already installed it.
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL
          if (script && new URL(script).pathname === '/offline-sw.js') void registration.unregister()
        }
      }).catch(() => {})
    }
    if ('caches' in window) void caches.delete('wms-shell-v1').catch(() => {})
    try {
      Object.keys(sessionStorage).filter((key) => key.startsWith('wms.offline.v1.')).forEach((key) => sessionStorage.removeItem(key))
    } catch { /* Storage may be disabled. */ }
  }, [])
  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isConsole = pathname === `/${ADMIN_CONSOLE_PATH}` || pathname.startsWith(`/${ADMIN_CONSOLE_PATH}/`)
  const isUploader = pathname === '/u' || pathname.startsWith('/u/')
  const isHome = pathname === '/'
  const isAccount = pathname === '/account' || pathname.startsWith('/account/') || pathname === "/signup"
  const isInvite = pathname.startsWith('/invite/')
  const isReset = pathname.startsWith('/reset/')
  const hideChrome = isConsole || isUploader || isHome || isAccount || isInvite || isReset

  return (
    <html lang="en" className="light" data-theme="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body
        className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[color-mix(in_oklab,var(--user-accent)_28%,transparent)]"
        suppressHydrationWarning
      >
        {hideChrome ? null : <Header />}
        {children}
        {hideChrome ? null : <Footer />}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
