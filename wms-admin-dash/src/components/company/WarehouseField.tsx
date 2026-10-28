import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

export default function WarehouseField({ label, required, hint, error, className = '', children }: {
  label: string; required?: boolean; hint?: string; error?: string; className?: string; children: ReactNode
}) {
  const id = useId()
  const descriptionId = `${id}-description`
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id, 'aria-describedby': hint || error ? descriptionId : undefined,
        'aria-invalid': error ? true : undefined, 'aria-required': required || undefined,
      })
    : children
  return <div className={`ui-field wh-field ${className}`}>
    <label className="demo-label" htmlFor={id}>{label}{required ? <span className="ui-field-required" aria-hidden>*</span> : null}</label>
    {control}
    {hint || error ? <p id={descriptionId} className={error ? 'ui-field-error' : 'ui-field-hint'}>{error || hint}</p> : null}
  </div>
}
