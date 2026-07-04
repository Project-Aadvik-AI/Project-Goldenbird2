import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'

type SimpleItem = { id: string; name: string }
type MachineItem = { id: string; name: string; type: string | null }
type ItemMaster = { id: string; name: string; unit: string | null }
type BoqItem = { id: string; schedule: string; item: string; unit: string | null; boq_qty: number | null }

type Tab = 'vendors' | 'machines' | 'items' | 'expense_types' | 'activities' | 'operators' | 'boq'

const TABS: { key: Tab; label: string }[] = [
  { key: 'vendors', label: 'Vendors' },
  { key: 'machines', label: 'Machines' },
  { key: 'items', label: 'Items' },
  { key: 'expense_types', label: 'Expense Types' },
  { key: 'activities', label: 'Activities' },
  { key: 'operators', label: 'Operators' },
  { key: 'boq', label: 'BoQ' },
]

export default function Masters() {
  const [tab, setTab] = useState<Tab>('vendors')

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Master Data</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Manage vendors, machines, items and BoQ</p>
      </div>

      <div className="flex gap-1 flex-wrap mb-5 border-b border-white/10">
        {TABS.map(t => (
          <button key={t.key} type="button"
            className={`px-4 py-2.5 font-semibold text-sm transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? 'border-[#ff8f00] text-[#ffb87b]'
                : 'border-transparent text-[#dcc1ae] hover:text-[#e2e2e8]'
            }`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'vendors' && <VendorList />}
      {tab === 'machines' && <MachineList />}
      {tab === 'items' && <ItemList />}
      {tab === 'expense_types' && <SimpleList table="m_expense_types" label="Expense Type" />}
      {tab === 'activities' && <SimpleList table="m_activities" label="Activity" />}
      {tab === 'operators' && <SimpleList table="m_operators" label="Operator" />}
      {tab === 'boq' && <BoqList />}
    </div>
  )
}

type Vendor = {
  id: string; name: string
  gstin: string | null; contact_person: string | null; phone: string | null
  email: string | null; address: string | null; bank_details: string | null
  category: string | null; is_active: boolean
}

function VendorList() {
  const [rows, setRows] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [filter, setFilter] = useState<'Active' | 'All' | 'Inactive'>('Active')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('m_vendors').select('*').order('name')
    setRows((data as Vendor[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggle(v: Vendor) {
    await supabase.from('m_vendors').update({ is_active: !v.is_active }).eq('id', v.id)
    load()
  }

  const visible = rows.filter(r =>
    filter === 'All' ? true : filter === 'Active' ? r.is_active !== false : r.is_active === false
  )

  return (
    <div>
      <div className="flex justify-between mb-3 gap-2 flex-wrap">
        <select className="input" value={filter} onChange={e => setFilter(e.target.value as any)} style={{ minWidth: 130 }}>
          <option>Active</option><option>Inactive</option><option>All</option>
        </select>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Vendor
        </button>
      </div>
      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Name', 'Category', 'GSTIN', 'Contact', 'Phone', 'Email', 'Active', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(v => (
              <tr key={v.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{v.name}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{v.category || '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{v.gstin || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{v.contact_person || '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{v.phone || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae] truncate max-w-[200px]">{v.email || '—'}</td>
                <td className="px-4 py-3">
                  <button className={`text-xs font-semibold uppercase tracking-wider hover:underline ${v.is_active !== false ? 'text-emerald-400' : 'text-[#dcc1ae]/60'}`} onClick={() => toggle(v)}>
                    {v.is_active !== false ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => { setEditing(v); setShowForm(true) }}>Edit</button>
                </td>
              </tr>
            ))}
            {!visible.length && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No vendors.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showForm && <VendorForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function VendorForm({ editing, onClose, onSaved }: { editing: Vendor | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [category, setCategory] = useState(editing?.category ?? '')
  const [gstin, setGstin] = useState(editing?.gstin ?? '')
  const [contact, setContact] = useState(editing?.contact_person ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [bank, setBank] = useState(editing?.bank_details ?? '')
  const [active, setActive] = useState(editing?.is_active !== false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name required'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), category: category || null, gstin: gstin || null,
      contact_person: contact || null, phone: phone || null, email: email || null,
      address: address || null, bank_details: bank || null, is_active: active,
    }
    if (editing) {
      const { error } = await supabase.from('m_vendors').update(payload).eq('id', editing.id)
      setBusy(false); if (error) { setErr(error.message); return }
    } else {
      const { data: prof } = await supabase.from('profiles').select('org_id').single()
      const { error } = await supabase.from('m_vendors').insert({ ...payload, org_id: prof?.org_id })
      setBusy(false); if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Vendor' : 'Add Vendor'}</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          <L label="Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Category"><input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Steel supplier, Contractor…" /></L>
            <L label="GSTIN"><input className="input mono" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} /></L>
            <L label="Contact person"><input className="input" value={contact} onChange={e => setContact(e.target.value)} /></L>
            <L label="Phone"><input className="input mono" value={phone} onChange={e => setPhone(e.target.value)} /></L>
            <L label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></L>
            <L label="Active">
              <select className="input" value={active ? 'yes' : 'no'} onChange={e => setActive(e.target.value === 'yes')}>
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </select>
            </L>
          </div>
          <L label="Address"><textarea className="input" rows={2} value={address} onChange={e => setAddress(e.target.value)} /></L>
          <L label="Bank details"><textarea className="input" rows={2} value={bank} onChange={e => setBank(e.target.value)} placeholder="A/C 12345, IFSC ABCD0123, HDFC…" /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Vendor'}</button>
        </div>
      </form>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}

function SimpleList({ table, label }: { table: string; label: string }) {
  const [rows, setRows] = useState<SimpleItem[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from(table).select('id, name').order('name')
    setRows((data as SimpleItem[]) ?? [])
  }
  useEffect(() => { load() }, [table])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from(table).insert({ org_id: prof?.org_id, name: name.trim() })
    setName(''); setBusy(false); load()
  }

  async function del(id: string) {
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return (
    <div className="card p-4">
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input className="input flex-1" placeholder={`Add ${label}`} value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary px-5" disabled={busy}>{busy ? '…' : 'Add'}</button>
      </form>
      <div className="space-y-0.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="text-sm text-[#e2e2e8]">{r.name}</span>
            <button onClick={() => del(r.id)} className="text-[11px] text-red-400/60 hover:text-red-400 px-2 py-1 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>
        ))}
        {!rows.length && <div className="text-[#dcc1ae]/60 text-sm py-3 text-center">No {label.toLowerCase()}s yet.</div>}
      </div>
    </div>
  )
}

function MachineList() {
  const [rows, setRows] = useState<MachineItem[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('m_machines').select('id, name, type').order('name')
    setRows((data as MachineItem[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from('m_machines').insert({ org_id: prof?.org_id, name: name.trim(), type: type || null })
    setName(''); setType(''); setBusy(false); load()
  }

  async function del(id: string) {
    await supabase.from('m_machines').delete().eq('id', id); load()
  }

  return (
    <div className="card p-4">
      <form onSubmit={add} className="flex gap-2 mb-4 flex-wrap">
        <input className="input flex-1 min-w-[140px]" placeholder="Machine name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input flex-1 min-w-[120px]" placeholder="Type (Excavator…)" value={type} onChange={e => setType(e.target.value)} />
        <button className="btn btn-primary px-5" disabled={busy}>{busy ? '…' : 'Add'}</button>
      </form>
      <div className="space-y-0.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="text-sm font-semibold text-[#e2e2e8]">{r.name}</span>
            <span className="text-[11px] text-[#dcc1ae]/60 mr-auto ml-3">{r.type || ''}</span>
            <button onClick={() => del(r.id)} className="text-[11px] text-red-400/60 hover:text-red-400 px-2 py-1 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>
        ))}
        {!rows.length && <div className="text-[#dcc1ae]/60 text-sm py-3 text-center">No machines yet.</div>}
      </div>
    </div>
  )
}

function ItemList() {
  const [rows, setRows] = useState<ItemMaster[]>([])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('m_items').select('id, name, unit').order('name')
    setRows((data as ItemMaster[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from('m_items').insert({ org_id: prof?.org_id, name: name.trim(), unit: unit || null })
    setName(''); setUnit(''); setBusy(false); load()
  }

  async function del(id: string) {
    await supabase.from('m_items').delete().eq('id', id); load()
  }

  return (
    <div className="card p-4">
      <form onSubmit={add} className="flex gap-2 mb-4 flex-wrap">
        <input className="input flex-1 min-w-[140px]" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input w-24" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)} />
        <button className="btn btn-primary px-5" disabled={busy}>{busy ? '…' : 'Add'}</button>
      </form>
      <div className="space-y-0.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="text-sm font-semibold text-[#e2e2e8]">{r.name}</span>
            <span className="text-[11px] text-[#dcc1ae]/60 mr-auto ml-3">{r.unit || ''}</span>
            <button onClick={() => del(r.id)} className="text-[11px] text-red-400/60 hover:text-red-400 px-2 py-1 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>
        ))}
        {!rows.length && <div className="text-[#dcc1ae]/60 text-sm py-3 text-center">No items yet.</div>}
      </div>
    </div>
  )
}

function BoqList() {
  const { activeProject } = useProject()
  const [rows, setRows] = useState<BoqItem[]>([])
  const [schedule, setSchedule] = useState('')
  const [item, setItem] = useState('')
  const [unit, setUnit] = useState('')
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!activeProject) { setRows([]); return }
    const { data } = await supabase.from('m_boq')
      .select('id, schedule, item, unit, boq_qty')
      .eq('project_id', activeProject.id)
      .order('schedule').order('item')
    setRows((data as BoqItem[]) ?? [])
  }
  useEffect(() => { load() }, [activeProject?.id])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!item.trim() || !activeProject) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from('m_boq').insert({
      org_id: prof?.org_id, project_id: activeProject.id,
      schedule: schedule || null, item: item.trim(),
      unit: unit || null, boq_qty: qty ? Number(qty) : null,
    })
    setSchedule(''); setItem(''); setUnit(''); setQty(''); setBusy(false); load()
  }

  if (!activeProject) {
    return (
      <div className="card p-6 text-center text-[#dcc1ae]/70 text-sm">
        Pick a project first — each project has its own BoQ.
      </div>
    )
  }

  async function del(id: string) {
    await supabase.from('m_boq').delete().eq('id', id); load()
  }

  return (
    <div className="card p-4">
      <div className="text-[11px] text-[#dcc1ae]/60 mb-3">Enter each BoQ item below. Bulk import from Excel coming soon.</div>
      <form onSubmit={add} className="flex gap-2 mb-4 flex-wrap">
        <input className="input min-w-[100px] flex-1" placeholder="Schedule" value={schedule} onChange={e => setSchedule(e.target.value)} />
        <input className="input min-w-[160px] flex-1" placeholder="Item description" value={item} onChange={e => setItem(e.target.value)} />
        <input className="input w-20" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)} />
        <input className="input w-28" style={{ fontFamily: 'var(--font-mono)' }} placeholder="BoQ Qty" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
        <button className="btn btn-primary px-5" disabled={busy}>{busy ? '…' : 'Add'}</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Schedule','Item','Unit','BoQ Qty',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2.5 text-[#dcc1ae]">{r.schedule}</td>
                <td className="px-3 py-2.5 font-semibold text-[#e2e2e8]">{r.item}</td>
                <td className="px-3 py-2.5 text-[#dcc1ae]">{r.unit || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8]">{r.boq_qty != null ? Number(r.boq_qty).toLocaleString('en-IN') : '—'}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => del(r.id)} className="text-red-400/60 hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-[#dcc1ae]/60 text-sm">No BoQ items yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}