import BrandLogo from './BrandLogo'
import '../styles/brand-loader.css'

type BrandLoaderProps = {
  label?: string
  compact?: boolean
  className?: string
}

export default function BrandLoader({ label = 'Loading...', compact = false, className = '' }: BrandLoaderProps) {
  return (
    <div className={`brand-loader${compact ? ' brand-loader--compact' : ''}${className ? ` ${className}` : ''}`}
      role="status" aria-live="polite" aria-label={label}>
      <div className="brand-loader-content">
      <div className="brand-loader-visual" aria-hidden="true">
        <BrandLogo className="brand-loader-logo" title="Synovia" />
        <span className="brand-loader-track"><span /></span>
      </div>
      <span className="brand-loader-label">{label}</span>
      </div>
    </div>
  )
}
