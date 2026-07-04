import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'

type LedgerRow = {
  id: string; date: string; direction: string; item: string; unit: string
  qty: number; value: number | null; vendor: string | null
  tag_type: string | null; tag: string | null; challan: string | null; remark: string | null
}

type StockBalance = { item: string; unit: string; in_qty: number; out_qty: number; balance: number }

export default function Store() {
  const { activeProject } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [stock, setStock] = useState<StockBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!activeProject) { setRows([]); setStock([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('store_ledger').select('*')
      .eq('project_id', activeProject.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    const ledger = (data as LedgerRow[]) ?? []
    setRows(ledger)
    const map: Record<string, StockBalance> = {}
    for (const r of ledger) {
      if (!map[r.item]) map[r.item] = { item: r.item, unit: r.unit, in_qty: 0, out_qty: 0, balance: 0 }
      if (r.direction === 'IN') map[r.item].in_qty += Number(r.qty)
      else map[r.item].out_qty += Number(r.qty)
      map[r.item].balance = map[r.item].in_qty - map[r.item].out_qty
    }
    setStock(Object.values(map).sort((a, b) => a.item.localeCompare(b.item)))
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Store IN / OUT</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Material receipts, issues and live stock balance</p>
        </div>
        {can('store', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Entry
          </button>
        )}
      </div>

      {stock.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {stock.map(s => (
            <div key={s.item} className={`card p-4 relative overflow-hidden ${s.balance <= 0 ? 'kpi-red' : 'kpi-amber'}`}>
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2 truncate">{s.item}</div>
              <div className={`font-mono text-2xl font-bold leading-none ${s.balance <= 0 ? 'text-red-400' : 'text-[#ffb87b]'}`}>
                {Number(s.balance).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-[#dcc1ae]/60 mt-1">{s.unit} · IN {s.in_qty.toLocaleString('en-IN')} / OUT {s.out_qty.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5">
          <span className="text-sm font-semibold text-[#e2e2e8]">Ledger</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date', 'Dir', 'Item', 'Qty', 'Unit', 'Value', 'Vendor / Tag', 'Challan', 'Remark'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${r.direction === 'IN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {r.direction}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.item}</td>
                <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8]">{Number(r.qty).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.unit}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.value != null ? `₹${Number(r.value).toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.vendor || r.tag || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.challan || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No entries yet — add your first IN.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <StoreForm projectId={activeProject.id} stock={stock} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}

function StoreForm({ projectId, stock, onClose, onSaved }: { projectId: string; stock: StockBalance[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [item, setItem] = useState('')
  const [unit, setUnit] = useState('')
  const [qty, setQty] = useState('')
  const [value, setValue] = useState('')
  const [vendor, setVendor] = useState('')
  const [tagType, setTagType] = useState('Machine')
  const [tag, setTag] = useState('')
  const [challan, setChallan] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (direction === 'OUT') {
      const found = stock.find(s => s.item.toLowerCase() === item.toLowerCase())
      if (found) setUnit(found.unit)
    }
  }, [item, direction, stock])

  const availableQty = stock.find(s => s.item.toLowerCase() === item.toLowerCase())?.balance ?? null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const qtyNum = Number(qty)
    if (!item.trim()) { setErr('Enter an item name'); return }
    if (!qty || qtyNum <= 0) { setErr('Enter a valid quantity'); return }
    if (direction === 'OUT') {
      if (availableQty === null) { setErr(`"${item}" has no stock on record`); return }
      if (qtyNum > availableQty) { setErr(`Only ${availableQty.toLocaleString('en-IN')} ${unit} in stock`); return }
    }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('store_ledger').insert({
      org_id: prof?.org_id, project_id: projectId, date, direction,
      item: item.trim(), unit: unit.trim(), qty: qtyNum,
      value: value ? Number(value) : null,
      vendor: direction === 'IN' ? (vendor || null) : null,
      tag_type: direction === 'OUT' ? tagType : null,
      tag: direction === 'OUT' ? (tag || null) : null,
      challan: challan || null, remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Store Entry</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="flex gap-2 mb-4">
            {(['IN', 'OUT'] as const).map(d => (
              <button key={d} type="button"
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors border ${direction === d
                  ? d === 'IN' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-transparent text-[#dcc1ae] border-white/10 hover:bg-white/5'}`}
                onClick={() => setDirection(d)}>
                {d === 'IN' ? '↓ IN (Received)' : '↑ OUT (Issued)'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Item / Material">
              <input className="input" value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Diesel, Cement" list="store-items" />
              <datalist id="store-items">{stock.map(s => <option key={s.item} value={s.item} />)}</datalist>
            </L>
            <L label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Ltrs / Bags / Nos" /></L>
            <L label="Quantity">
              <input className="input mono" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
              {direction === 'OUT' && availableQty !== null && (
                <div className={`text-[11px] mt-1 ${availableQty <= 0 ? 'text-red-400' : 'text-[#dcc1ae]/60'}`}>
                  Available: {availableQty.toLocaleString('en-IN')} {unit}
                </div>
              )}
            </L>
            {direction === 'IN' ? (
              <>
                <L label="Value (₹)"><input className="input mono" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></L>
                <L label="Vendor"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></L>
              </>
            ) : (
              <>
                <L label="Issued to (type)">
                  <select className="input" value={tagType} onChange={e => setTagType(e.target.value)}>
                    <option>Machine</option><option>Subcontractor</option><option>Labour</option><option>Other</option>
                  </select>
                </L>
                <L label="Issued to (name)"><input className="input" value={tag} onChange={e => setTag(e.target.value)} placeholder={tagType} /></L>
              </>
            )}
            <L label="Challan No."><input className="input" value={challan} onChange={e => setChallan(e.target.value)} /></L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : `Save ${direction}`}</button>
        </div>
      </form>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 col-span-1">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}