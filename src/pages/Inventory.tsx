import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const qty = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

export type Unit = { id: string; code: string; name: string | null; decimals: number; active: boolean }
export type Category = { id: string; name: string; parent_id: string | null; active: boolean }
export type Item = {
  id: string; item_code: string | null; name: string; category_id: string | null; unit_id: string | null
  item_type: string; hsn_code: string | null; gst_rate: number
  reorder_level: number; min_stock: number; max_stock: number | null
  costing_method: string; standard_rate: number
  allow_negative: boolean; track_batch: boolean; track_serial: boolean
  barcode: string | null; notes: string | null; active: boolean
}
export type Warehouse = {
  id: string; project_id: string | null; code: string | null; name: string
  parent_id: string | null; is_main: boolean; location: string | null
  keeper_id: string | null; active: boolean
}
type Balance = {
  item_id: string; item_code: string | null; item_name: string; unit: string | null
  warehouse_id: string | null; warehouse_name: string | null
  balance_qty: number; reorder_level: number
}

const ITEM_TYPES = ['Consumable', 'Asset', 'Tool', 'Spare', 'Fuel', 'Other']
const COSTING = ['WeightedAvg', 'FIFO', 'Standard']

type Tab = 'items' | 'warehouses' | 'categories' | 'units'

export default function Inventory() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('items')
  const [ready, setReady] = useState<boolean | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('inv_items').select('id', { count: 'exact', head: true })
      setReady((count ?? 0) > 0)
    })()
  }, [])

  async function seed() {
    if (!confirm(
      'Set up the Item Master?\n\n' +
      'This will:\n' +
      '• Create standard units and categories\n' +
      '• Create a "Main Store" warehouse for each project\n' +
      '• Convert every item already in your Store ledger into a real item\n' +
      '  (typos like "Cement" / "cement" are merged into one)\n' +
      '• Link your existing ledger rows to those items\n\n' +
      'Your existing Store data is NOT deleted — nothing breaks.'
    )) return
    setSeeding(true)
    const { data, error } = await supabase.rpc('inv_seed_and_migrate')
    setSeeding(false)
    if (error) { alert('Setup failed:\n\n' + error.message); return }
    const r = (data as any[])?.[0]
    alert(
      'Item Master created.\n\n' +
      `Units: ${r?.units_created ?? 0}\n` +
      `Categories: ${r?.categories_created ?? 0}\n` +
      `Items: ${r?.items_created ?? 0}\n` +
      `Warehouses: ${r?.warehouses_created ?? 0}\n` +
      `Ledger rows linked: ${r?.ledger_rows_linked ?? 0}`
    )
    setReady(true)
  }

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Inventory masters are restricted to administrators.</div>

  if (ready === false) return (
    <div className="max-w-lg mx-auto mt-10 card p-8 text-center">
      <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '44px' }}>inventory_2</span>
      <h1 className="font-headline text-xl font-semibold text-[#e2e2e8] mt-3">Set up the Item Master</h1>
      <p className="text-[13px] text-[#dcc1ae] mt-2">
        Right now your Store records items as <b>free text</b> — so "Cement", "cement" and "Cement "
        count as three different items and your stock balance is unreliable.
      </p>
      <p className="text-[13px] text-[#dcc1ae] mt-2">
        This creates a real item master, standard units and categories, a Main Store per project,
        and safely converts your existing ledger. <b>Nothing is deleted.</b>
      </p>
      <button className="btn btn-primary mt-5" disabled={seeding} onClick={seed}>
        {seeding ? 'Setting up…' : 'Create Item Master'}
      </button>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Inventory Masters</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Items, warehouses, categories and units — the foundation of stock control.</p>
      </div>

      <div className="flex gap-1 mb-5 flex-wrap">
        {([['items', 'Items'], ['warehouses', 'Warehouses'], ['categories', 'Categories'], ['units', 'Units']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'items' && <Items />}
      {tab === 'warehouses' && <Warehouses />}
      {tab === 'categories' && <Categories />}
      {tab === 'units' && <Units />}
    </div>
  )
}

// =====================================================================
//  ITEMS
// =====================================================================
function Items() {
  const [rows, setRows] = useState<Item[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [bal, setBal] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: i }, { data: c }, { data: u }, { data: b }] = await Promise.all([
      supabase.from('inv_items').select('*').order('name'),
      supabase.from('inv_categories').select('*').order('name'),
      supabase.from('inv_units').select('*').order('code'),
      supabase.from('inv_stock_balance').select('item_id, balance_qty, reorder_level'),
    ])
    setRows((i as Item[]) ?? [])
    setCats((c as Category[]) ?? [])
    setUnits((u as Unit[]) ?? [])
    setBal((b as Balance[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const catOf = (id: string | null) => (id ? cats.find(c => c.id === id)?.name : null) || '—'
  const unitOf = (id: string | null) => (id ? units.find(u => u.id === id)?.code : null) || '—'
  const stockOf = (id: string) =>
    bal.filter(b => b.item_id === id).reduce((n, b) => n + Number(b.balance_qty || 0), 0)

  const filtered = useMemo(() => rows.filter(r => {
    if (fCat && r.category_id !== fCat) return false
    const s = q.trim().toLowerCase()
    if (s && !`${r.name} ${r.item_code ?? ''} ${r.hsn_code ?? ''}`.toLowerCase().includes(s)) return false
    return true
  }), [rows, q, fCat])

  const lowStock = useMemo(() =>
    rows.filter(r => Number(r.reorder_level || 0) > 0 && stockOf(r.id) <= Number(r.reorder_level)),
    [rows, bal])

  return (
    <div>
      {lowStock.length > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>warning</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{lowStock.length} item(s) at or below reorder level:</b>{' '}
            <span className="text-[#dcc1ae]">
              {lowStock.slice(0, 5).map(i => `${i.name} (${qty(stockOf(i.id))})`).join(' · ')}
              {lowStock.length > 5 ? ` +${lowStock.length - 5} more` : ''}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <div className="flex gap-2">
          <input className="input" style={{ maxWidth: 240 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" />
          <select className="input" value={fCat} onChange={e => setFCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <ExportButtons filename="item-master" title="Item Master" rows={filtered}
            columns={[
              { header: 'Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.name },
              { header: 'Category', get: (r: any) => catOf(r.category_id) },
              { header: 'Unit', get: (r: any) => unitOf(r.unit_id) },
              { header: 'Type', get: (r: any) => r.item_type },
              { header: 'HSN', get: (r: any) => r.hsn_code || '—' },
              { header: 'GST %', get: (r: any) => Number(r.gst_rate) },
              { header: 'Current Stock', get: (r: any) => stockOf(r.id) },
              { header: 'Reorder Level', get: (r: any) => Number(r.reorder_level) },
              { header: 'Costing', get: (r: any) => r.costing_method },
            ]} />
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Item
          </button>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Item', 'Category', 'Unit', 'Type', 'Current Stock', 'Reorder', 'HSN / GST', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(r => {
                const stock = stockOf(r.id)
                const low = Number(r.reorder_level || 0) > 0 && stock <= Number(r.reorder_level)
                return (
                  <tr key={r.id} className={`hover:bg-white/[0.02] ${low ? 'bg-amber-500/[0.04]' : ''} ${!r.active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.item_code || '—'}</td>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">
                      {r.name}
                      {r.track_batch && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#dcc1ae]/60 uppercase">batch</span>}
                      {r.allow_negative && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 uppercase">−ve ok</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{catOf(r.category_id)}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{unitOf(r.unit_id)}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{r.item_type}</td>
                    <td className={`px-4 py-2.5 font-mono font-bold text-right ${low ? 'text-amber-400' : stock < 0 ? 'text-red-400' : 'text-[#e2e2e8]'}`}>
                      {qty(stock)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">
                      {Number(r.reorder_level) ? qty(r.reorder_level) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">
                      {r.hsn_code || '—'}{Number(r.gst_rate) ? ` · ${r.gst_rate}%` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                        onClick={() => { setEditing(r); setShowForm(true) }}>Edit</button>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No items match.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <ItemForm editing={editing} cats={cats} units={units}
        onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function ItemForm({ editing, cats, units, onClose, onSaved }: {
  editing: Item | null; cats: Category[]; units: Unit[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [catId, setCatId] = useState(editing?.category_id ?? '')
  const [unitId, setUnitId] = useState(editing?.unit_id ?? '')
  const [type, setType] = useState(editing?.item_type ?? 'Consumable')
  const [hsn, setHsn] = useState(editing?.hsn_code ?? '')
  const [gst, setGst] = useState(editing ? String(editing.gst_rate) : '')
  const [reorder, setReorder] = useState(editing ? String(editing.reorder_level) : '')
  const [minS, setMinS] = useState(editing ? String(editing.min_stock) : '')
  const [maxS, setMaxS] = useState(editing?.max_stock != null ? String(editing.max_stock) : '')
  const [costing, setCosting] = useState(editing?.costing_method ?? 'WeightedAvg')
  const [rate, setRate] = useState(editing ? String(editing.standard_rate) : '')
  const [allowNeg, setAllowNeg] = useState(editing?.allow_negative ?? false)
  const [batch, setBatch] = useState(editing?.track_batch ?? false)
  const [active, setActive] = useState(editing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Item name is required.'); return }
    if (!unitId) { setErr('Unit is required.'); return }
    setBusy(true); setErr(null)

    const payload: any = {
      name: name.trim(), category_id: catId || null, unit_id: unitId,
      item_type: type, hsn_code: hsn || null, gst_rate: Number(gst) || 0,
      reorder_level: Number(reorder) || 0, min_stock: Number(minS) || 0,
      max_stock: maxS ? Number(maxS) : null,
      costing_method: costing, standard_rate: Number(rate) || 0,
      allow_negative: allowNeg, track_batch: batch, active,
    }

    let error
    if (editing) {
      ({ error } = await supabase.from('inv_items').update(payload).eq('id', editing.id))
    } else {
      const { data: code } = await supabase.rpc('inv_next_item_code')
      ;({ error } = await supabase.from('inv_items').insert({ ...payload, item_code: code ?? null }))
    }
    setBusy(false)
    if (error) {
      setErr(error.message.includes('duplicate') ? 'An item with this name already exists.' : error.message)
      return
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{editing ? 'Edit Item' : 'New Item'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <F label="Item Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="OPC 43 Grade Cement" autoFocus /></F>
          </div>
          <F label="Category">
            <select className="input" value={catId} onChange={e => setCatId(e.target.value)}>
              <option value="">— None —</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </F>
          <F label="Unit *">
            <select className="input" value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">— Select —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.code}{u.name ? ` — ${u.name}` : ''}</option>)}
            </select>
          </F>
          <F label="Item Type">
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {ITEM_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="HSN Code"><input className="input mono" value={hsn} onChange={e => setHsn(e.target.value)} /></F>
          <F label="GST Rate (%)"><input className="input mono" inputMode="decimal" value={gst} onChange={e => setGst(e.target.value.replace(/[^\d.]/g, ''))} /></F>
          <F label="Standard Rate (₹)"><input className="input mono" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ''))} /></F>

          <div className="sm:col-span-2 pt-3 border-t border-white/[0.06]">
            <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">Stock Control</div>
            <div className="grid grid-cols-3 gap-4">
              <F label="Reorder Level"><input className="input mono" inputMode="decimal" value={reorder} onChange={e => setReorder(e.target.value.replace(/[^\d.]/g, ''))} /></F>
              <F label="Min Stock"><input className="input mono" inputMode="decimal" value={minS} onChange={e => setMinS(e.target.value.replace(/[^\d.]/g, ''))} /></F>
              <F label="Max Stock"><input className="input mono" inputMode="decimal" value={maxS} onChange={e => setMaxS(e.target.value.replace(/[^\d.]/g, ''))} /></F>
            </div>
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">An alert shows when stock falls to or below the reorder level.</p>
          </div>

          <F label="Costing Method">
            <select className="input" value={costing} onChange={e => setCosting(e.target.value)}>
              {COSTING.map(c => <option key={c} value={c}>{c === 'WeightedAvg' ? 'Weighted Average' : c}</option>)}
            </select>
          </F>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-[12px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={allowNeg} onChange={e => setAllowNeg(e.target.checked)} />
              Allow negative stock
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={batch} onChange={e => setBatch(e.target.checked)} />
              Track batches
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={active} onChange={e => setActive(e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        {err && <div className="px-5 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Item'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  WAREHOUSES
// =====================================================================
function Warehouses() {
  const { projects } = useProject()
  const [rows, setRows] = useState<Warehouse[]>([])
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: w }, { data: e }] = await Promise.all([
      supabase.from('inv_warehouses').select('*').order('name'),
      supabase.from('employees').select('id, full_name').order('full_name'),
    ])
    setRows((w as Warehouse[]) ?? [])
    setEmps((e as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const projOf = (id: string | null) => (id ? projects.find(p => p.id === id)?.name : null) || 'Company-wide'
  const empOf = (id: string | null) => (id ? emps.find(e => e.id === id)?.full_name : null) || '—'
  const parentOf = (id: string | null) => (id ? rows.find(r => r.id === id)?.name : null) || '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#dcc1ae]">Each project can have a Main Store and any number of sub-stores under it.</p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Warehouse
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Warehouse', 'Project / Site', 'Under', 'Store Keeper', 'Location', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map(w => (
                <tr key={w.id} className={`hover:bg-white/[0.02] ${!w.active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{w.code || '—'}</td>
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">
                    {w.name}
                    {w.is_main && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-[#ff8f00]/10 text-[#ffb87b] uppercase">main</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{projOf(w.project_id)}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{parentOf(w.parent_id)}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{empOf(w.keeper_id)}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{w.location || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                      onClick={() => { setEditing(w); setShowForm(true) }}>Edit</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No warehouses yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <WarehouseForm editing={editing} all={rows} emps={emps}
        onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function WarehouseForm({ editing, all, emps, onClose, onSaved }: {
  editing: Warehouse | null; all: Warehouse[]; emps: { id: string; full_name: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const { projects } = useProject()
  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [projectId, setProjectId] = useState(editing?.project_id ?? '')
  const [parentId, setParentId] = useState(editing?.parent_id ?? '')
  const [isMain, setIsMain] = useState(editing?.is_main ?? false)
  const [location, setLocation] = useState(editing?.location ?? '')
  const [keeper, setKeeper] = useState(editing?.keeper_id ?? '')
  const [active, setActive] = useState(editing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // possible parents: main stores in the same project
  const parents = all.filter(w =>
    w.id !== editing?.id && w.project_id === (projectId || null) && w.is_main)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Warehouse name is required.'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), code: code || null, project_id: projectId || null,
      parent_id: parentId || null, is_main: isMain, location: location || null,
      keeper_id: keeper || null, active,
    }
    const { error } = editing
      ? await supabase.from('inv_warehouses').update(payload).eq('id', editing.id)
      : await supabase.from('inv_warehouses').insert(payload)
    setBusy(false)
    if (error) {
      setErr(error.message.includes('duplicate') ? 'A warehouse with this name already exists on this project.' : error.message)
      return
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-lg p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">{editing ? 'Edit Warehouse' : 'New Warehouse'}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <F label="Warehouse Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Main Store / Cement Godown" autoFocus /></F>
          </div>
          <F label="Code"><input className="input mono" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="WH-01" /></F>
          <F label="Project / Site">
            <select className="input" value={projectId} onChange={e => { setProjectId(e.target.value); setParentId('') }}>
              <option value="">Company-wide</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Under (parent store)">
            <select className="input" value={parentId} onChange={e => setParentId(e.target.value)} disabled={isMain}>
              <option value="">— None (top level) —</option>
              {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Store Keeper">
            <select className="input" value={keeper} onChange={e => setKeeper(e.target.value)}>
              <option value="">— None —</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </F>
          <div className="sm:col-span-2">
            <F label="Location"><input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Near gate 2, site yard" /></F>
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
            <input type="checkbox" className="accent-[#ff8f00]" checked={isMain}
              onChange={e => { setIsMain(e.target.checked); if (e.target.checked) setParentId('') }} />
            Main store for this project
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
            <input type="checkbox" className="accent-[#ff8f00]" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Warehouse'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  CATEGORIES  &  UNITS  (simple masters)
// =====================================================================
function Categories() {
  const [rows, setRows] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('inv_categories').select('*').order('name')
    setRows((data as Category[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('inv_categories').insert({ name: name.trim() })
    setBusy(false)
    if (error) { setErr(error.message.includes('duplicate') ? 'Already exists.' : error.message); return }
    setName(''); load()
  }

  return (
    <div>
      <form onSubmit={add} className="card p-4 mb-4 flex gap-3 items-end">
        <label className="block flex-1">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Category Name</span>
          <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Cement & Concrete" />
        </label>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Add Category</button>
      </form>
      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">Category</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(c => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8]">{c.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${c.active
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-[#dcc1ae]/60 border-white/10'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Units() {
  const [rows, setRows] = useState<Unit[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('inv_units').select('*').order('code')
    setRows((data as Unit[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('inv_units').insert({ code: code.trim(), name: name.trim() || null })
    setBusy(false)
    if (error) { setErr(error.message.includes('duplicate') ? 'Already exists.' : error.message); return }
    setCode(''); setName(''); load()
  }

  return (
    <div>
      <form onSubmit={add} className="card p-4 mb-4 flex gap-3 items-end">
        <label className="block" style={{ width: 120 }}>
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Code</span>
          <input className="input w-full mono" value={code} onChange={e => setCode(e.target.value)} placeholder="Bag" />
        </label>
        <label className="block flex-1">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Full Name</span>
          <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Bag of 50 kg" />
        </label>
        <button className="btn btn-primary" disabled={busy || !code.trim()}>Add Unit</button>
      </form>
      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Code', 'Name', 'Decimals'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(u => (
              <tr key={u.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] font-semibold">{u.code}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{u.name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{u.decimals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}