import type { ReactNode } from 'react'

type FormFieldProps = {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

export default function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label className="demo-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ui-field-required" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? <p className="ui-field-error">{error}</p> : null}
      {!error && hint ? <p className="ui-field-hint">{hint}</p> : null}
    </div>
  )
}
