import { createFileRoute, redirect } from '@tanstack/react-router'
import SmtpSettingsPanel, { type EmailTab } from '../../components/company/SmtpSettingsPanel'
import { getCompanySession } from '../../lib/auth'

export const Route = createFileRoute('/account/email')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: EmailTab } => ({
    tab: ['server', 'alerts', 'recipients'].includes(search.tab as EmailTab)
      ? (search.tab as EmailTab)
      : undefined,
  }),
  beforeLoad: () => {
    if (getCompanySession()?.user.role && getCompanySession()?.user.role !== 'root') {
      throw redirect({ to: '/account/orders' })
    }
  },
  component: SmtpSettingsPanelRoute,
})

function SmtpSettingsPanelRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <SmtpSettingsPanel
      tab={tab ?? 'server'}
      onTabChange={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: next }),
          resetScroll: false,
        })
      }}
    />
  )
}
