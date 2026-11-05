import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, Building2, PackageOpen } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { ADMIN_CONSOLE_PATH } from '../lib/config'
import { isCompanyAuthenticated, isPlatformAuthenticated } from '../lib/auth'

export const Route = createFileRoute('/')({
  ssr: false,
  component: HomePage,
})

function HomePage() {
  const signedIn = isPlatformAuthenticated()
  const companySignedIn = isCompanyAuthenticated()

  return (
    <AuthLayout
      headline="Orders in."
      headlineEm="Shipments out."
      lede="A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back. Tracking lands on the order — without the spreadsheet."
    >
      <div className="home-welcome">
        <h2 className="home-welcome-title">Less friction.<br /><em>More flow.</em></h2>
        <p className="home-welcome-copy">From checkout to doorstep.<br />Keep every order moving, beautifully.</p>
        <div className="home-entry-links">
          <Link className="home-entry home-entry-primary" to={companySignedIn ? '/account' : '/account/login'}>
            <span className="home-entry-icon"><Building2 size={22} strokeWidth={1.6} /></span>
            <span className="home-entry-copy">
              <strong>{companySignedIn ? 'Open workspace' : 'Company sign in'}</strong>
              <span>Manage orders &amp; fulfillment</span>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
          <Link className="home-entry home-entry-secondary" to="/u/login">
            <span className="home-entry-icon"><PackageOpen size={22} strokeWidth={1.6} /></span>
            <span className="home-entry-copy">
              <strong>Warehouse portal</strong>
              <span>Upload shipment files</span>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>
        {signedIn ? (
          <Link className="home-console-link" to="/$consolePath" params={{ consolePath: ADMIN_CONSOLE_PATH }}>
            Open platform console <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </AuthLayout>
  )
}
