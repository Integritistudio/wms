import { Link } from '@tanstack/react-router'

type GatePageProps = {
  kicker?: string
  title: string
  italic?: string
  lede: string
}

export default function GatePage({ kicker = 'WMS Linker', title, italic, lede }: GatePageProps) {
  return (
    <main className="login-shell login-shell-solo">
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
            {title}
            {italic ? <em>{italic}</em> : null}
          </h1>
          <p className="login-lede">{lede}</p>
          <div className="gate-actions">
            <Link to="/u/login" className="gate-link">
              Warehouse upload
            </Link>
          </div>
        </div>
        <p className="login-brand-foot">Shopify orders · EDI 940/945 · Private console</p>
      </section>
    </main>
  )
}
