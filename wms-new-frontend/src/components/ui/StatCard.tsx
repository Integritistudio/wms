type StatCardProps = {
  label: string
  value: string | number
  hint?: string
  warn?: boolean
}

export default function StatCard({ label, value, hint, warn }: StatCardProps) {
  return (
    <div className={`ui-stat${warn ? ' is-warn' : ''}`}>
      <div className="ui-stat-label">{label}</div>
      <div className="ui-stat-value">{value}</div>
      {hint ? <div className="ui-stat-hint">{hint}</div> : null}
    </div>
  )
}
