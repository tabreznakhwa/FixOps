'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Search, ChevronDown, X, Package } from 'lucide-react'

const PRESET_SERVICES = [
  {
    group: '❄️ AC Services',
    items: [
      { label: 'Filter Cleaning', price: 5 },
      { label: 'Gas Top-up (R22)', price: 15 },
      { label: 'Gas Top-up (R32 / R410A)', price: 20 },
      { label: 'Drain Block Removal', price: 10 },
      { label: 'AC Full Service (Clean + Check)', price: 25 },
      { label: 'Split AC Installation', price: 40 },
      { label: 'Cassette / Ceiling AC Installation', price: 60 },
      { label: 'AC Uninstallation', price: 20 },
      { label: 'Thermostat Replacement', price: 15 },
      { label: 'Capacitor Replacement', price: 12 },
      { label: 'Fan Motor Replacement', price: 35 },
      { label: 'Compressor Diagnostic', price: 10 },
      { label: 'PCB / Control Board Repair', price: 30 },
      { label: 'Remote Control Replacement', price: 8 },
      { label: 'Gas Leak Detection', price: 15 },
      { label: 'Duct Cleaning (per unit)', price: 20 },
      { label: 'Annual AC Maintenance Contract', price: 60 },
      { label: 'Custom AC Service', price: 0 },
    ],
  },
  {
    group: '🔧 Plumbing',
    items: [
      { label: 'Leak Detection & Repair', price: 10 },
      { label: 'Pipe Replacement', price: 20 },
      { label: 'Tap / Faucet Replacement', price: 15 },
      { label: 'Toilet Repair / Flush Fix', price: 15 },
      { label: 'Water Heater Installation', price: 25 },
      { label: 'Drain Unblocking / Cleaning', price: 10 },
      { label: 'Kitchen Sink Repair', price: 12 },
      { label: 'Shower Mixer Replacement', price: 20 },
      { label: 'Water Tank Cleaning', price: 30 },
      { label: 'Custom Plumbing Service', price: 0 },
    ],
  },
  {
    group: '⚡ Electrical',
    items: [
      { label: 'Wiring Repair', price: 15 },
      { label: 'Switch / Socket Replacement', price: 8 },
      { label: 'MCB / Breaker Replacement', price: 12 },
      { label: 'Light Fixture Installation', price: 8 },
      { label: 'Ceiling Fan Installation', price: 15 },
      { label: 'DB Panel Inspection', price: 10 },
      { label: 'Earth Leakage / RCD Testing', price: 12 },
      { label: 'Cable Pulling & Trunking', price: 20 },
      { label: 'Custom Electrical Service', price: 0 },
    ],
  },
  {
    group: '🔨 General',
    items: [
      { label: 'Inspection / Site Visit', price: 5 },
      { label: 'Labour Charge (per hour)', price: 10 },
      { label: 'Transportation / Call-out Fee', price: 3 },
      { label: 'Emergency Call-out Surcharge', price: 15 },
      { label: 'Annual Maintenance Contract (AMC)', price: 50 },
      { label: 'Warranty Repair', price: 0 },
      { label: 'Custom Service', price: 0 },
    ],
  },
]

const ALL_SERVICES_MAP = Object.fromEntries(
  PRESET_SERVICES.flatMap(g => g.items).map(s => [s.label, s.price])
)

interface InventoryItem {
  id: string
  item_code: string
  item_name: string
  unit_of_measure: string
  current_stock: number
  selling_price: number
}

interface LineItem {
  id: string
  item_type: 'custom' | 'part' | 'service'
  description: string
  quantity: number
  unit_price: number
  inventory_item_id: string | null
}

interface Props {
  workOrderId: string
  inventoryItems: InventoryItem[]
  existingParts: LineItem[]
  isCompleted: boolean
}

type TabType = 'custom' | 'part' | 'service'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

function ItemCombobox({
  items,
  value,
  onChange,
}: {
  items: InventoryItem[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = items.find(i => i.id === value) ?? null
  const filtered = query.trim()
    ? items.filter(i =>
        i.item_name.toLowerCase().includes(query.toLowerCase()) ||
        i.item_code.toLowerCase().includes(query.toLowerCase())
      )
    : items

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        {selected ? (
          <span className="flex-1 truncate">
            <span className="font-medium">{selected.item_name}</span>
            <span className="ml-2 text-slate-400 text-xs">{selected.item_code}</span>
          </span>
        ) : (
          <span className="text-slate-400 flex-1">Select part from inventory…</span>
        )}
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {selected && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search parts…"
                className="w-full pl-8 pr-3 py-1.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No items match</li>
            ) : filtered.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => { onChange(item.id); setOpen(false); setQuery('') }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 ${item.id === value ? 'bg-blue-50 text-blue-700' : 'text-slate-800'}`}
                >
                  <span>
                    <span className="font-medium">{item.item_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{item.item_code}</span>
                  </span>
                  <span className={`text-xs flex-shrink-0 font-semibold ${item.current_stock <= 0 ? 'text-red-500' : 'text-slate-500'}`}>
                    {item.current_stock} {item.unit_of_measure}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ServiceCombobox({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredGroups = query.trim()
    ? PRESET_SERVICES.map(g => ({
        ...g,
        items: g.items.filter(s => s.label.toLowerCase().includes(query.toLowerCase())),
      })).filter(g => g.items.length > 0)
    : PRESET_SERVICES

  const totalFiltered = filteredGroups.reduce((n, g) => n + g.items.length, 0)
  const showAddCustom = query.trim().length > 0 && !(query.trim() in ALL_SERVICES_MAP)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(label: string) { onChange(label); setOpen(false); setQuery('') }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        {value
          ? <span className="flex-1 truncate font-medium">{value}</span>
          : <span className="text-slate-400 flex-1">Search or type new service…</span>}
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {value && (
            <span role="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search or type a new service…"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {/* Always-visible custom entry at the top */}
            {!showAddCustom && (
              <li>
                <button type="button" onClick={() => {
                  const name = query.trim() || ''
                  if (name) { select(name) } else { inputRef.current?.focus() }
                }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors text-blue-600 font-semibold flex items-center gap-2 border-b border-slate-100">
                  <Plus className="w-4 h-4" />
                  {query.trim() ? `Use "${query.trim()}" as custom service` : 'Type above to add a custom service'}
                </button>
              </li>
            )}
            {showAddCustom && (
              <li>
                <button type="button" onClick={() => select(query.trim())}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors text-blue-700 font-semibold flex items-center gap-2 border-b border-slate-100">
                  <Plus className="w-4 h-4" />
                  Add &quot;{query.trim()}&quot; as new service
                </button>
              </li>
            )}
            {totalFiltered === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No preset services match</li>
            )}
            {filteredGroups.map(group => (
              <li key={group.group}>
                <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 sticky top-0">
                  {group.group}
                </div>
                <ul>
                  {group.items.map(svc => (
                    <li key={svc.label}>
                      <button type="button" onClick={() => select(svc.label)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between gap-3 ${svc.label === value ? 'bg-blue-50 text-blue-700' : 'text-slate-800'}`}>
                        <span>{svc.label}</span>
                        {svc.price > 0 && (
                          <span className="text-xs text-slate-400 flex-shrink-0">KWD {svc.price.toFixed(3)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const TYPE_ICON: Record<TabType, string> = { custom: '✏️', part: '📦', service: '🔧' }
const TYPE_LABEL: Record<TabType, string> = { custom: 'Custom', part: 'Part', service: 'Service' }

export function WorkOrderParts({ workOrderId, inventoryItems, existingParts, isCompleted }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<LineItem[]>(existingParts)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<TabType>('custom')

  // Form state
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [inventoryItemId, setInventoryItemId] = useState('')
  const [serviceLabel, setServiceLabel] = useState('')

  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const selectedInvItem = inventoryItems.find(i => i.id === inventoryItemId) ?? null

  function resetForm() {
    setDescription('')
    setQuantity('1')
    setUnitPrice('')
    setInventoryItemId('')
    setServiceLabel('')
    setError('')
  }

  function switchTab(t: TabType) {
    setTab(t)
    resetForm()
  }

  function handleInventorySelect(id: string) {
    setInventoryItemId(id)
    const item = inventoryItems.find(i => i.id === id)
    if (item) {
      setDescription(item.item_name)
      setUnitPrice(item.selling_price.toFixed(3))
    } else {
      setDescription('')
      setUnitPrice('')
    }
  }

  function handleServiceSelect(label: string) {
    setServiceLabel(label)
    if (label in ALL_SERVICES_MAP) {
      const price = ALL_SERVICES_MAP[label]
      // "Custom X Service" presets clear description so user types their own
      setDescription(label.toLowerCase().startsWith('custom ') ? '' : label)
      setUnitPrice(price.toFixed(3))
    } else {
      // Fully custom service typed by user — pre-fill description with what they typed
      setDescription(label)
      setUnitPrice('0.000')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const desc = description.trim()
    const qty = parseFloat(quantity)
    const price = parseFloat(unitPrice)

    if (!desc) { setError('Description is required'); return }
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be greater than 0'); return }
    if (isNaN(price) || price < 0) { setError('Enter a valid unit price'); return }
    if (tab === 'part' && !inventoryItemId) { setError('Select a part from inventory'); return }
    if (tab === 'part' && selectedInvItem && qty > selectedInvItem.current_stock) {
      setError(`Only ${selectedInvItem.current_stock} ${selectedInvItem.unit_of_measure} in stock`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: tab,
          description: desc,
          quantity: qty,
          unit_price: price,
          inventory_item_id: tab === 'part' ? inventoryItemId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setItems(prev => [...prev, data.lineItem])
      resetForm()
      setShowForm(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(itemId: string) {
    if (!confirm('Remove this line item? Stock will be returned to inventory if it was a part.')) return
    setRemoving(itemId)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/line-items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_item_id: itemId }),
      })
      if (!res.ok) throw new Error('Delete failed')
      setItems(prev => prev.filter(i => i.id !== itemId))
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setRemoving(null)
    }
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">Line Items</h2>
        {items.length > 0 && (
          <span className="text-sm font-bold text-slate-700">
            Total: KWD {total.toFixed(3)}
          </span>
        )}
      </div>

      {/* Column headers */}
      {items.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit Price</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
      )}

      {/* Existing items */}
      {items.length === 0 && !showForm && (
        <div className="flex items-center gap-3 py-4 text-sm text-slate-400">
          <Package className="w-5 h-5" />
          No line items recorded yet
        </div>
      )}

      {items.length > 0 && (
        <div className="mb-4 divide-y divide-slate-50 border border-slate-100 rounded-lg overflow-hidden">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{TYPE_ICON[item.item_type]}</span>
                  <p className="text-sm font-medium text-slate-800 truncate">{item.description}</p>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.quantity} × KWD {Number(item.unit_price).toFixed(3)} = KWD {(item.quantity * item.unit_price).toFixed(3)}
                </p>
              </div>
              {!isCompleted && (
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={removing === item.id}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition flex-shrink-0"
                >
                  {removing === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {!isCompleted && (
        showForm ? (
          <form onSubmit={handleAdd} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            {/* Type tabs */}
            <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold divide-x divide-slate-200 w-fit">
              {(['custom', 'part', 'service'] as TabType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`px-3 py-1.5 transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {TYPE_ICON[t]} {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Part picker */}
            {tab === 'part' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Select Part
                </label>
                <ItemCombobox items={inventoryItems} value={inventoryItemId} onChange={handleInventorySelect} />
                {selectedInvItem && (
                  <p className="text-xs text-slate-400 mt-1">
                    Stock: <span className={selectedInvItem.current_stock <= 0 ? 'text-red-500 font-semibold' : 'text-slate-600 font-semibold'}>
                      {selectedInvItem.current_stock} {selectedInvItem.unit_of_measure}
                    </span>
                    {' '}· KWD {selectedInvItem.selling_price.toFixed(3)}
                  </p>
                )}
              </div>
            )}

            {/* Service picker */}
            {tab === 'service' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Select Service
                </label>
                <ServiceCombobox
                  value={serviceLabel}
                  onChange={handleServiceSelect}
                />
              </div>
            )}

            {/* Description + Qty + Price */}
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-6">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={tab === 'custom' ? 'Enter description…' : 'Auto-filled, editable'}
                  className={inputCls}
                  required
                />
              </div>
              <div className="col-span-5 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Qty</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className={`${inputCls} text-right`}
                  required
                />
              </div>
              <div className="col-span-7 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Unit Price (KWD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                  placeholder="0.000"
                  className={`${inputCls} text-right`}
                />
              </div>
            </div>

            {/* Line total preview */}
            {parseFloat(quantity) > 0 && parseFloat(unitPrice) >= 0 && (
              <p className="text-xs text-slate-500 text-right">
                Line total: <span className="font-bold text-slate-800">
                  KWD {(parseFloat(quantity) * parseFloat(unitPrice)).toFixed(3)}
                </span>
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Add Item'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 text-slate-600 text-sm font-semibold rounded-lg hover:border-blue-400 hover:text-blue-600 transition"
          >
            <Plus className="w-4 h-4" /> Add Line Item
          </button>
        )
      )}
    </div>
  )
}
