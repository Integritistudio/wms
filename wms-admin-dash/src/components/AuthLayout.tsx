import type { ReactNode } from 'react'

type AuthLayoutProps = {
  kicker: string
  headline: string
  headlineEm: string
  lede?: string
  brandFoot?: string
  children: ReactNode
}

export default function AuthLayout({
  kicker,
  headline,
  headlineEm,
  lede,
  brandFoot = 'Invite-only access · Encrypted sessions',
  children,
}: AuthLayoutProps) {
  return (
    <main className="login-shell">
      <section className="login-brand" aria-label="WMS Linker">
        <div className="login-brand-glow" aria-hidden="true" />
        <div className="login-brand-top">
          <span className="login-mark" aria-hidden="true">
            L
          </span>
          <div className="login-brand-copy">
            <span className="login-brand-name">Linker</span>
            <span className="login-brand-tag">WMS × Ecommerce</span>
          </div>
        </div>

        <div className="login-brand-inner">
          <p className="login-kicker">{kicker}</p>
          <figure className="login-hero">
            <img
              className="login-hero-img"
              src="/linker-hero.png"
              alt="Linker connecting warehouse inventory with your ecommerce storefront"
              width={1200}
              height={675}
              decoding="async"
            />
          </figure>
          <h1 className="login-headline">
            {headline}
            <em>{headlineEm}</em>
          </h1>
          {lede ? <p className="login-lede">{lede}</p> : null}
        </div>

        <p className="login-brand-foot">{brandFoot}</p>
      </section>

      <section className="login-panel">
        <div className="login-card">{children}</div>
      </section>
    </main>
  )
}
