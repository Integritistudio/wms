import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell p-6 sm:p-8">
        <p className="island-kicker mb-2">About</p>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-[var(--sea-ink)]">
          Shopify to warehouse middleware
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
          WMS Linker routes Shopify orders to warehouses, dispatches EDI or ModernWMS work,
          and syncs shipments and tracking back to the store.
        </p>
        <div className="mt-6">
          <Link className="demo-button" to="/account/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  )
}
