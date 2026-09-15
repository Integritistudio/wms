import { createFileRoute } from '@tanstack/react-router'
import CompanyShell from '../../components/company/CompanyShell'
import ProcessDiagramsPanel from '../../components/company/ProcessDiagramsPanel'

export const Route = createFileRoute('/account/diagrams')({
  ssr: false,
  component: () => (
    <CompanyShell activeId="diagrams">
      <ProcessDiagramsPanel />
    </CompanyShell>
  ),
})
