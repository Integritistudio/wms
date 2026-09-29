import { createFileRoute } from '@tanstack/react-router'
import ProcessDiagramsPanel from '../../components/company/ProcessDiagramsPanel'

export const Route = createFileRoute('/account/diagrams')({
  ssr: false,
  component: ProcessDiagramsPanel,
})
