import type { ReactNode } from 'react'

type FormFieldProps = {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
  className?: string
}

export default function FormField({ label, htmlFor, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="demo-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="demo-cell-secondary">{hint}</p> : null}
    </div>
  )
}
