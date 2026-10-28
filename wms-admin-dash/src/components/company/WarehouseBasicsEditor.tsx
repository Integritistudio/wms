import FormField from './WarehouseField'
import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, MapPin, Pencil, Warehouse as WarehouseIcon } from 'lucide-react'
import { listCountries, listStates, updateCompanyWarehouse, type LocationCountry, type LocationState, type Warehouse } from '../../lib/api'
import { Button } from '../ui'

export default function WarehouseBasicsEditor({ warehouse, onSaved }: {
  warehouse: Warehouse
  onSaved: () => void
}) {
  // Addresses created by the warehouse API end with state, postal code, country.
  const addressParts = (warehouse.address || '').split(',').map(part => part.trim())
  const hasCountry = addressParts.length >= 3 && /^[A-Z]{2}$/.test(addressParts.at(-1) || '')
  const hasState = hasCountry && addressParts.length >= 4 && /^[A-Z0-9-]{1,3}$/.test(addressParts.at(-3) || '')
  const initial = () => ({

    name: warehouse.name,
    code: warehouse.code || '',
    address: hasCountry ? addressParts.slice(0, hasState ? -3 : -2).join(', ') : warehouse.address || '',
    country: hasCountry ? addressParts.at(-1)! : '',
    state: hasState ? addressParts.at(-3)! : '',
    postalCode: hasCountry ? addressParts.at(-2)! : '',
    zipPrefixes: (warehouse.zipPrefixes || []).join(', '),
    minStockThreshold: String(warehouse.minStockThreshold ?? 0),
    isActive: warehouse.isActive !== false,
  })
  const [draft, setDraft] = useState(initial)
  const [countries, setCountries] = useState<LocationCountry[]>([])
  const [states, setStates] = useState<LocationState[]>([])
  const [loadingCountries, setLoadingCountries] = useState(false)
  const [loadingStates, setLoadingStates] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingCountries(true)
    setLocationError('')
    listCountries().then(rows => { if (!cancelled) setCountries(rows) })
      .catch(() => { if (!cancelled) setLocationError('Unable to load countries. Close and reopen the editor to retry.') })
      .finally(() => { if (!cancelled) setLoadingCountries(false) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!draft.country || !open) { setStates([]); return }
    let cancelled = false
    setStates([])
    setLoadingStates(true)
    setLocationError('')
    listStates(draft.country).then(rows => { if (!cancelled) setStates(rows) })
      .catch(() => { if (!cancelled) setLocationError('Unable to load states. Close and reopen the editor to retry.') })
      .finally(() => { if (!cancelled) setLoadingStates(false) })
    return () => { cancelled = true }
  }, [draft.country, open])

  function toggle() {
    if (saving) return
    if (!open) { if (!dirty) setDraft(initial()); setError(''); setNotice('') }
    setOpen(!open)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!draft.name.trim()) { setError('Enter a warehouse name.'); return }
    if (!draft.country) { setError('Select a country.'); return }
    if (states.length && !states.some(state => state.isoCode === draft.state)) { setError('Select a state / province.'); return }
    if (!draft.postalCode.trim()) { setError('Enter a ZIP / postal code.'); return }
    const stock = Number(draft.minStockThreshold)
    if (!Number.isSafeInteger(stock) || stock < 0) { setError('Stock threshold must be a whole number of zero or more.'); return }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await updateCompanyWarehouse(warehouse.id, {
        name: draft.name.trim(), code: draft.code.trim(), street: draft.address.trim(),
        country: draft.country, state: draft.state, zip: draft.postalCode.trim(),
        zipPrefixes: draft.zipPrefixes.split(',').map(value => value.trim()).filter(Boolean),
        minStockThreshold: stock, isActive: draft.isActive,
      })
      onSaved()
      setNotice('Warehouse details saved.')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save warehouse details. Try again.')
    } finally { setSaving(false) }
  }

  return (
    <section className="wh-basics" aria-label="Warehouse details">
      <button type="button" className="wh-basics-summary" onClick={toggle} aria-expanded={open} aria-controls="warehouse-basic-fields" disabled={saving}>
        <span className="wh-basics-icon"><WarehouseIcon size={20} aria-hidden /></span>
        <span className="wh-basics-heading"><strong>Warehouse details</strong><span className="wh-basics-address"><MapPin size={13} aria-hidden /><span title={warehouse.address}>{warehouse.address || 'Add an address for this location'}</span></span></span>
        <span className="wh-basics-edit"><Pencil size={13} aria-hidden />{open ? 'Collapse' : 'Edit details'}</span>
        <ChevronDown size={16} className={open ? 'is-open' : ''} aria-hidden />
      </button>
      {notice ? <p className="wh-basics-notice" role="status">{notice}</p> : null}
      <div id="warehouse-basic-fields" hidden={!open}>
        <form onSubmit={save} aria-busy={saving}>
          <fieldset disabled={saving} className="wh-basics-fields">
            <FormField label="Warehouse name" required><input className="demo-input" value={draft.name} required onChange={e => setDraft({ ...draft, name: e.target.value })} autoComplete="organization" /></FormField>
            <FormField label="Warehouse code"><input className="demo-input" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="e.g. NYC-01" /></FormField>
            <FormField label="Street address and city" className="wh-basics-wide" required><textarea className="demo-input" rows={2} required value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} autoComplete="street-address" placeholder="Street address, city" /></FormField>
            <FormField label="Country" required><select className="demo-input" required value={draft.country} disabled={loadingCountries} autoComplete="country" onChange={e => setDraft({ ...draft, country: e.target.value, state: '', postalCode: '' })}><option value="">{loadingCountries ? 'Loading countries...' : 'Select country'}</option>{countries.map(country => <option key={country.isoCode} value={country.isoCode}>{country.name}</option>)}</select></FormField>
            <FormField label="State / province" required={states.length > 0}><select className="demo-input" value={draft.state} required={states.length > 0} disabled={!draft.country || loadingStates || !states.length} autoComplete="address-level1" onChange={e => setDraft({ ...draft, state: e.target.value })}><option value="">{loadingStates ? 'Loading states...' : !draft.country ? 'Select a country first' : !states.length ? 'Not applicable' : 'Select state / province'}</option>{states.map(state => <option key={state.isoCode} value={state.isoCode}>{state.name}</option>)}</select></FormField>
            <FormField label="ZIP / postal code" required hint="Postal code of the warehouse address."><input className="demo-input" required value={draft.postalCode} autoComplete="postal-code" onChange={e => setDraft({ ...draft, postalCode: e.target.value })} /></FormField>
            <FormField label="ZIP / postal prefixes" hint="Separate prefixes with commas."><input className="demo-input" value={draft.zipPrefixes} onChange={e => setDraft({ ...draft, zipPrefixes: e.target.value })} placeholder="10001, 10002" /></FormField>
            <FormField label="Minimum stock threshold" hint="Minimum stock level for this warehouse."><input className="demo-input" type="number" min={0} step={1} required value={draft.minStockThreshold} onChange={e => setDraft({ ...draft, minStockThreshold: e.target.value })} /></FormField>
            <label className="wh-basics-status wh-basics-wide"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /><span><strong>Active warehouse</strong><small>Allow this location to participate in order routing.</small></span></label>
          </fieldset>
          {locationError ? <p className="wh-basics-error" role="alert">{locationError}</p> : null}
          {error ? <p className="wh-basics-error" role="alert">{error}</p> : null}
          <footer className="wh-basics-footer"><span>{dirty ? 'Unsaved changes' : 'Details are up to date'}</span><Button type="button" variant="secondary" disabled={saving} onClick={() => { setDraft(initial()); setOpen(false); setError('') }}>Cancel</Button><Button type="submit" disabled={saving || !dirty || loadingCountries || loadingStates || !!locationError || !countries.length}>{saving ? 'Saving...' : 'Save changes'}</Button></footer>
        </form>
      </div>
    </section>
  )
}
