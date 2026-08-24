import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteInventoryItem,
  getWarehouseInventory,
  saveWarehouseInventory,
  type InventoryItem,
} from '../../lib/api'
import { DataTable, FormField, ListToolbar, StatusBadge } from '../ui'

export default function WarehouseInventoryEditor({
  warehouseId,
  warehouseName,
  onError,
}: {
  warehouseId: string
  warehouseName?: string
  onError?: (message: string) => void
}) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState('10')
  const [mode, setMode] = useState<'add' | 'set'>('add')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localNotice, setLocalNotice] = useState('')

  async function load() {
    setLoading(true)
    try {
      const next = await getWarehouseInventory(warehouseId)
      setItems(Array.isArray(next) ? next : [])
      setLocalError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load inventory'
      setLocalError(message)
      onError?.(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  const filtered = q.trim()
    ? items.filter((item) => item.sku.toLowerCase().includes(q.trim().toLowerCase()))
    : items

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    const nextSku = sku.trim()
    const amount = Number(qty)
    if (!nextSku || !Number.isFinite(amount) || amount < 0) {
      const message = 'Enter a SKU and a valid quantity'
      setLocalError(message)
      onError?.(message)
      return
    }
    setBusy(true)
    setLocalError('')
    setLocalNotice('')
    try {
      if (mode === 'add') {
        await saveWarehouseInventory(warehouseId, [{ sku: nextSku, adjustBy: amount }])
      } else {
        await saveWarehouseInventory(warehouseId, [{ sku: nextSku, quantityOnHand: amount }])
      }
      setSku('')
      setQty('10')
      setLocalNotice(
        mode === 'add' ? `Added ${amount} to ${nextSku}` : `Set ${nextSku} on-hand to ${amount}`,
      )
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save product'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="grid gap-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div>
        <strong className="text-sm">Products / SKUs</strong>
        <p className="demo-muted text-sm mt-1">
          {warehouseName ? `${warehouseName} · ` : ''}
          Add stock manually. When an order ships from this warehouse, quantity on hand decreases automatically.
        </p>
      </div>

      {localError ? <p className="demo-alert demo-alert-danger text-sm">{localError}</p> : null}
      {localNotice ? <p className="demo-muted text-sm">{localNotice}</p> : null}

      <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
        <FormField label="SKU">
          <input
            className="demo-input"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. TEE-BLK-M"
            required
            autoComplete="off"
          />
        </FormField>
        <FormField label="Quantity">
          <input
            className="demo-input"
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Mode" hint={mode === 'add' ? 'Adds to existing stock' : 'Sets absolute on-hand'}>
          <select className="demo-input" value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'set')}>
            <option value="add">Add to stock</option>
            <option value="set">Set on-hand</option>
          </select>
        </FormField>
        <div className="flex items-end">
          <button className="demo-button w-full" type="submit" disabled={busy || !warehouseId}>
            {busy ? 'Saving…' : mode === 'add' ? 'Add product' : 'Save quantity'}
          </button>
        </div>
      </form>

      <ListToolbar
        search={q}
        searchPlaceholder="Filter SKUs…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="SKUs"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={[
          {
            key: 'sku',
            header: 'SKU',
            sortable: true,
            sortValue: (row) => row.sku,
            render: (row) => <span className="demo-cell-primary">{row.sku}</span>,
          },
          {
            key: 'onHand',
            header: 'On hand',
            align: 'right',
            className: 'num',
            sortable: true,
            sortValue: (row) => row.quantityOnHand,
            render: (row) => row.quantityOnHand,
          },
          {
            key: 'available',
            header: 'Available',
            align: 'right',
            className: 'num',
            render: (row) => row.quantityAvailable,
          },
          {
            key: 'reserved',
            header: 'Reserved',
            align: 'right',
            className: 'num',
            render: (row) =>
              row.reserved ? <StatusBadge status="pending" label={String(row.reserved)} variant="warning" /> : '0',
          },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (
              <button
                type="button"
                className="demo-btn demo-btn-sm demo-btn-danger"
                onClick={() =>
                  void deleteInventoryItem(warehouseId, row.sku)
                    .then(() => load())
                    .catch((err) => {
                      const message = err instanceof Error ? err.message : 'Unable to remove'
                      setLocalError(message)
                      onError?.(message)
                    })
                }
              >
                Remove
              </button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(row) => row.sku}
        loading={loading}
        emptyTitle="No products yet"
        emptyMessage="Add a SKU and quantity above to track stock for this warehouse."
      />
    </div>
  )
}
