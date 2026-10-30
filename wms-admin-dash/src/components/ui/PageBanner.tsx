import { useId, type ReactNode } from 'react'
import { Activity, Bell, BookOpen, CircleCheck, CirclePause, Clock, GitBranch, LockKeyhole, Mail, Package, RotateCcw, Server, Settings, Shield, Truck, Users, Warehouse } from 'lucide-react'
import '../../styles/page-banner.css'

const ICONS = { analytics: Activity, notifications: Bell, guide: BookOpen, routing: GitBranch, email: Mail, orders: Package, returns: RotateCcw, sftp: Server, settings: Settings, platform: Shield, tracking: Truck, users: Users, warehouse: Warehouse }
export type BannerVariant = keyof typeof ICONS

export function BannerSnapshot({ items, label }: {
  label: string
  items: { label: string; value: number | string; hint: string; onClick?: () => void; active?: boolean }[]
}) {
  return <div className="banner-snapshot" aria-label={label}>{items.map((item) => {
    const content = <><BannerStatIcon label={item.label} /><div className="banner-snapshot-copy"><div><strong>{item.value}</strong><span>{item.label}</span></div><small>{item.hint}</small></div></>
    return item.onClick
      ? <button key={item.label} type="button" className="banner-snapshot-row" onClick={item.onClick} aria-pressed={Boolean(item.active)}>{content}</button>
      : <div key={item.label} className="banner-snapshot-row">{content}</div>
  })}</div>
}

export function BannerStatIcon({ label }: { label: string }) {
  const name = label.toLowerCase()
  const [Icon, tone] = /active|available|enabled|ready|fulfilled|closed|received/.test(name) ? [CircleCheck, 'green'] as const
    : /pending|open|transit|hold/.test(name) ? [Clock, 'amber'] as const
    : /warehouse|reserved/.test(name) ? [Warehouse, 'violet'] as const
    : /password/.test(name) ? [LockKeyhole, 'violet'] as const
    : /off|paused/.test(name) ? [CirclePause, 'slate'] as const
    : /rule|routing/.test(name) ? [GitBranch, 'blue'] as const
    : /recipient|alert|smtp|outbound/.test(name) ? [Mail, 'blue'] as const
    : /connection/.test(name) ? [Server, 'blue'] as const
    : /total|user/.test(name) ? [Users, 'blue'] as const
    : [Package, 'blue'] as const
  return <span className="banner-stat-icon" data-tone={tone} aria-hidden="true"><Icon size={14} strokeWidth={2} /></span>
}

export function bannerVariant(title: string): BannerVariant {
  const name = title.toLowerCase()
  if (/warehouse|store/.test(name)) return 'warehouse'
  if (/user|team/.test(name)) return 'users'
  if (/sftp|edi/.test(name)) return 'sftp'
  if (/email|smtp/.test(name)) return 'email'
  if (/tracking|shipment/.test(name)) return 'tracking'
  if (/return/.test(name)) return 'returns'
  if (/routing/.test(name)) return 'routing'
  if (/order|fail/.test(name)) return 'orders'
  if (/guide|diagram/.test(name)) return 'guide'
  if (/setting/.test(name)) return 'settings'
  return 'platform'
}

/** Shared banner treatment for list pages and nested operational screens. */
export default function PageBanner({ children, className = '', variant = 'platform', label, stats }: {
  children: ReactNode
  className?: string
  variant?: BannerVariant
  label?: string
  stats?: ReactNode
}) {
  const gradientId = `banner-route-${useId().replace(/:/g, '')}`
  const Icon = ICONS[variant]
  return (
    <header className={`page-banner ${className}`.trim()} data-banner={variant} aria-label={label}>
      <div className="page-banner-content">{children}</div>
      <div className="page-banner-art" aria-hidden="true">
        <svg viewBox="0 0 260 110" fill="none">
          <defs><linearGradient id={gradientId} x1="20" y1="85" x2="230" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#60a5fa" /><stop offset="1" stopColor="#34d399" /></linearGradient></defs>
          <path d="M20 85H48C78 85 71 52 103 52C126 52 128 67 150 67C179 67 175 30 205 30H235" stroke={`url(#${gradientId})`} strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="85" r="9" fill="var(--banner-node)" stroke="#bfdbfe" strokeWidth="2" />
          <circle cx="20" cy="85" r="4" fill="#3b82f6" />
          <circle cx="103" cy="52" r="5" fill="#60a5fa" stroke="var(--banner-node)" strokeWidth="2.5" />
          <circle cx="150" cy="67" r="5" fill="#f59e0b" stroke="var(--banner-node)" strokeWidth="2.5" />
        </svg>
        <span className="page-banner-endpoint"><Icon size={24} strokeWidth={1.7} /></span>
      </div>
      {stats ? <div className="page-banner-stats">{stats}</div> : null}
    </header>
  )
}
