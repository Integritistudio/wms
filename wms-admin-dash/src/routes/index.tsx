import { Link, createFileRoute } from '@tanstack/react-router'
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
      kicker="Shopify to 3PL"
      headline="Orders in."
      headlineEm="Shipments out."
      lede="A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back. Tracking lands on the order — without the spreadsheet."
      brandFoot="Invite-only companies · Encrypted sessions"
    >
      <p className="login-card-kicker">How it moves</p>
      <h2 className="login-title">The quiet pipeline</h2>
      <ol className="home-steps">
        <li>
          <span>01</span>
          Shopify order arrives
        </li>
        <li>
          <span>02</span>
          Generic EDI 940 is written
        </li>
        <li>
          <span>03</span>
          Warehouse uploads the 945
        </li>
        <li>
          <span>04</span>
          Tracking returns to Shopify
        </li>
      </ol>
      {companySignedIn ? (
        <Link className="login-submit home-cta" to="/account">
          Open company
        </Link>
      ) : (
        <Link className="login-submit home-cta" to="/account/login">
          Company sign in
        </Link>
      )}
      {signedIn ? (
        <Link
          className="login-switch"
          to="/$consolePath"
          params={{ consolePath: ADMIN_CONSOLE_PATH }}
        >
          Open platform console
        </Link>
      ) : (
        <p className="login-switch">
          Warehouse uploaders use <Link to="/u/login">uploader sign in</Link>
        </p>
      )}
    </AuthLayout>
  )
}
