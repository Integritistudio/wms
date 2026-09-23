import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import AuthLayout from '../components/AuthLayout'
import Footer from '../components/Footer'
import Header from '../components/Header'

// Side-effect imports avoid Vite 8 / Rolldown `?url` → `?transform-only` path failures on Windows.
import '../styles.css'
import '../styles/portal-v2.css'
import '../styles/order-detail-refresh.css'
import '../styles/atelier-flow.css'
import '../styles/order-diagram.css'
import '../styles/order-cockpit.css'
import { ADMIN_CONSOLE_PATH } from '../lib/config'

const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;var accentId=window.localStorage.getItem('wms-accent-id')||'industrial';var custom=window.localStorage.getItem('wms-accent-custom')||'#FF4D2E';var presets={industrial:['#FF4D2E','#FF7A63','#D9381F'],sakura:['#FF6B8A','#FFA3B8','#E0456A'],blue:['#3b82f6','#60a5fa','#1d4ed8'],teal:['#14b8a6','#2dd4bf','#0f766e'],indigo:['#6366f1','#818cf8','#4338ca'],emerald:['#10b981','#34d399','#047857'],violet:['#8b5cf6','#a78bfa','#6d28d9'],rose:['#f43f5e','#fb7185','#be123c'],amber:['#f59e0b','#fbbf24','#b45309'],slate:['#8EA3B0','#B0C0CA','#5F7380']};var sakuraLight={ink:'#1A1C24',muted:'#8B95A8',paper:'#F3F5FA',foam:'#F8F9FC',card:'#FCFDFF',wash:'#EEF1F7',line:'#D5DBE8',mint:'#6EE7C5'};var sakuraDark={ink:'#F4F6FB',muted:'#8B95A8',paper:'#181B24',foam:'#12141B',card:'#1E2230',wash:'#252A38',line:'#343B4D',mint:'#6EE7C5'};function hexToRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');if(!/^[0-9a-fA-F]{6}$/.test(h))return{r:255,g:77,b:46};return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}}function toHex(r,g,b){return '#'+[r,g,b].map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return v.toString(16).padStart(2,'0')}).join('')}var accent,soft,deep;if(accentId==='custom'){var rgb=hexToRgb(custom);accent=toHex(rgb.r,rgb.g,rgb.b);soft=toHex(rgb.r+40,rgb.g+40,rgb.b+30);deep=toHex(rgb.r*0.72,rgb.g*0.72,rgb.b*0.78)}else{var p=presets[accentId]||presets.industrial;accent=p[0];soft=p[1];deep=p[2]}var dark=resolved==='dark';root.style.setProperty('--lagoon',dark?soft:accent);root.style.setProperty('--lagoon-deep',dark?soft:deep);root.style.setProperty('--palm',deep);root.style.setProperty('--shell-accent',dark?soft:deep);root.style.setProperty('--shell-accent-deep',deep);root.style.setProperty('--user-accent',accent);root.style.setProperty('--user-accent-soft',soft);root.style.setProperty('--user-accent-deep',deep);root.style.setProperty('--primary',dark?soft:accent);root.style.setProperty('--primary-container',dark?accent:deep);if(accentId==='sakura'){var s=dark?sakuraDark:sakuraLight;root.style.setProperty('--sea-ink',s.ink);root.style.setProperty('--on-surface',s.ink);root.style.setProperty('--text-muted',s.muted);root.style.setProperty('--outline',s.muted);root.style.setProperty('--sand',s.paper);root.style.setProperty('--foam',s.foam);root.style.setProperty('--surface',s.paper);root.style.setProperty('--surface-strong',s.card);root.style.setProperty('--bg-base',dark?s.foam:s.paper);root.style.setProperty('--line',s.line);root.style.setProperty('--outline-variant',s.line);root.style.setProperty('--chip-bg',s.wash);root.style.setProperty('--chip-line',s.line);root.style.setProperty('--surface-container',s.wash);root.style.setProperty('--surface-container-lowest',s.card);root.style.setProperty('--tertiary',s.mint);root.style.setProperty('--shell-bg',dark?s.foam:s.paper);root.style.setProperty('--shell-surface',s.card);root.style.setProperty('--shell-ink',s.ink);root.style.setProperty('--shell-muted',s.muted)}root.dataset.accent=accentId;}catch(e){}})();`

const HARBOR_INIT_SCRIPT = `(function(){try{var root=document.documentElement;if(root.dataset.accent!=='harbor')return;var dark=root.classList.contains('dark');var accent=dark?'#55B8B5':'#147D86';var deep='#075C66';var p=dark?{ink:'#EAF4F2',muted:'#A7BBB9',paper:'#162A32',foam:'#101E26',card:'#1D343D',wash:'#25414A',line:'#36545C'}:{ink:'#172C38',muted:'#647885',paper:'#F2F6F4',foam:'#F8FAF8',card:'#FFFFFF',wash:'#E7F0EE',line:'#CEDDD9'};var vars={'--lagoon':accent,'--lagoon-deep':dark?accent:deep,'--palm':deep,'--shell-accent':accent,'--shell-accent-deep':deep,'--user-accent':'#147D86','--user-accent-soft':'#55B8B5','--user-accent-deep':deep,'--primary':accent,'--primary-container':dark?'#147D86':deep,'--sea-ink':p.ink,'--sea-ink-soft':p.muted,'--text-muted':p.muted,'--on-surface':p.ink,'--on-surface-variant':p.muted,'--sand':p.paper,'--foam':p.foam,'--surface':p.paper,'--surface-strong':p.card,'--bg-base':p.foam,'--header-bg':dark?'rgba(16,30,38,.92)':'rgba(248,250,248,.92)','--line':p.line,'--outline':p.muted,'--outline-variant':p.line,'--kicker':p.muted,'--chip-bg':p.wash,'--chip-line':p.line,'--link-bg-hover':p.wash,'--surface-container':p.wash,'--surface-container-low':p.paper,'--surface-container-high':p.wash,'--surface-container-lowest':p.card,'--shell-bg':p.foam,'--shell-surface':p.card,'--shell-ink':p.ink,'--shell-muted':p.muted,'--shell-line':p.line};for(var key in vars)root.style.setProperty(key,vars[key])}catch(e){}})();`

const ATELIER_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('theme')!=='atelier')return;var root=document.documentElement;root.classList.remove('dark');root.classList.add('light');root.dataset.theme='atelier';root.style.colorScheme='light';var vars={'--sea-ink':'#20313A','--sea-ink-soft':'#50636A','--text-muted':'#68767B','--on-surface':'#20313A','--on-surface-variant':'#50636A','--sand':'#EEECE5','--foam':'#E8EDE8','--surface':'#EEECE5','--surface-strong':'#FAF8F2','--bg-base':'#E8EDE8','--header-bg':'rgba(238,236,229,.94)','--line':'#CBD2CD','--outline':'#68767B','--outline-variant':'#CBD2CD','--kicker':'#50636A','--chip-bg':'#DEE7E1','--chip-line':'#CBD2CD','--link-bg-hover':'#DEE7E1','--surface-container':'#DEE7E1','--surface-container-low':'#E8EDE8','--surface-container-high':'#D4E0D8','--surface-container-lowest':'#FAF8F2','--shell-bg':'#E8EDE8','--shell-surface':'#FAF8F2','--shell-ink':'#20313A','--shell-muted':'#68767B','--shell-line':'#CBD2CD','--lagoon':'#335CCD','--lagoon-deep':'#2445A5','--palm':'#2445A5','--shell-accent':'#335CCD','--shell-accent-deep':'#2445A5','--user-accent':'#335CCD','--user-accent-soft':'#6581DD','--user-accent-deep':'#2445A5','--primary':'#335CCD','--primary-container':'#2445A5','--primary-fixed':'#DCE3FF','--tertiary':'#F07861','--tertiary-fixed':'#FFE1D7'};for(var key in vars)root.style.setProperty(key,vars[key])}catch(e){}})();`

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
    links: [],
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
        <script dangerouslySetInnerHTML={{ __html: HARBOR_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: ATELIER_INIT_SCRIPT }} />
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
