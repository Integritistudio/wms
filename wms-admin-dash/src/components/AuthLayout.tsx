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
      <section className="login-brand">
        <div className="login-grain" />
        <div className="login-orbit" />
        <div className="login-brand-top">
          <span className="login-mark">W</span>
          <span className="login-brand-name">WMS Linker</span>
        </div>
        <div className="login-brand-inner">
          <p className="login-kicker">{kicker}</p>
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
