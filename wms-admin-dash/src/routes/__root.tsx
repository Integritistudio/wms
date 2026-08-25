import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import AuthLayout from '../components/AuthLayout'
import Footer from '../components/Footer'
import Header from '../components/Header'

import appCss from '../styles.css?url'
import { ADMIN_CONSOLE_PATH } from '../lib/config'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

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
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundScreen,
})

function NotFoundScreen() {
  return (
    <AuthLayout
      kicker="404"
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body
        className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(255,90,31,0.24)]"
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
