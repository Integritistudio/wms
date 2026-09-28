import type { ReactNode } from 'react'

const FEATURES = [
  { title: 'Real-time sync', detail: 'Inventory, orders, tracking.' },
  { title: 'EDI 940 / 945', detail: 'Standard, reliable flow.' },
  { title: 'Stay in control', detail: "See what's moving." },
  { title: 'Built for 3PL', detail: 'Scale with your partners.' },
] as const

type AuthLayoutProps = {
  headline?: string
  headlineEm?: string
  lede?: string
  children: ReactNode
}

export default function AuthLayout({
  headline = 'Orders in.',
  headlineEm = 'Shipments out.',
  lede = 'A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back. Tracking lands on the order — without the spreadsheet.',
  children,
}: AuthLayoutProps) {
  return (
    <main className="login-shell">
      <div className="login-shell-bg" aria-hidden="true">
        <img
          className="login-shell-bg-img"
          src="/linker-hero.png"
          alt=""
          width={1200}
          height={675}
          decoding="async"
        />
        <div className="login-shell-bg-wash" />
      </div>

      <header className="login-topbar">
        <div className="login-brand-top">
          <span className="login-mark" aria-hidden="true">
            L
          </span>
          <span className="login-brand-name">Linker</span>
        </div>
        <p className="login-topbar-tag">Shopify to 3PL —</p>
      </header>

      <div className="login-body">
        <section className="login-brand" aria-label="WMS Linker">
          <div className="login-brand-copy-block">
            <h1 className="login-headline">
              {headline} <em>{headlineEm}</em>
            </h1>
            {lede ? <p className="login-lede">{lede}</p> : null}
          </div>

          <ul className="login-features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="login-feature-icon" aria-hidden="true" />
                <strong>{feature.title}</strong>
                <span>{feature.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="login-panel">
          <div className="login-card">{children}</div>
          <aside className="login-secure" aria-label="Security">
            <span className="login-secure-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path
                  d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 12.2l1.7 1.7 3.5-3.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p>
              <strong>Secure. Private. Built for operations.</strong>
              Your data stays encrypted and protected.
            </p>
          </aside>
        </section>
      </div>
    </main>
  )
}
