import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import BrandLoader from './components/BrandLoader'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPendingComponent: BrandLoader,
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
