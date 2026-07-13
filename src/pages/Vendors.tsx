import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export type Vendor = {
  party_id: string; vendor_code: string | null; name: string
  company_name: string | null; category: string | null; status: string
  gstin: string | null; pan: string | null
  address: string | null; city: string | null; state: string | null
  pincode: string | null; country: string | null
  contact_name: string | null; phone: string | null; phone_alt: string | null
  email: string | null
  bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
  upi_id: string | null
  rating: number | null; blacklist_reason: string | null
  created_at: string; created_by_name: string | null
  po_count: number; po_value: number
  wo_count: number; wo_value: number
  bill_count: number; bill_value: number
  payable: number; project_count: number
  expired_docs: number; expiring_docs: number
}

export const CATEGORIES = [
  'Material Supplier', 'Labour Contractor', 'Equipment Rental',
  'Transport', 'Service Provider', 'Subcontractor', 'Other',
]

const STATUS_STYLE: Record<string, string> = {
  'Active': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Inactive': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
  'Blacklisted': 'bg-red-500/10 text-red-400 border-red-500/25',
}
const CAT_STYLE: Record<string, string> = {
  'Material Supplier': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Labour Contractor': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Equipment Rental': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Transport': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Service Provider': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Subcontractor': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'Other': 'bg-white/5 text-[#dcc1ae] border-white/10',
}

export default function Vendors() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [migrating, setMigrating] = useState(false)

  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fState, setFState] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('vendor_master').select('*').order('name')
    setRows((data as Vendor[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function migrate() {
    if (!confirm(
      'Bring your old vendors into the vendor master?\n\n' +
      'Every vendor named on a Work Order or Vendor Bill becomes a real vendor record ' +
      '(with an accounting ledger), and those documents are linked to it.\n\n' +
      'Nothing is deleted.'
    )) return
    setMigrating(true)
    const { data, error } = await supabase.rpc('migrate_vendors')
    setMigrating(false)
    if (error) { alert('Migration failed:\n\n' + error.message); return }
    const r = (data as any[])?.[0]
    alert(
      `Done.\n\n` +
      `Vendors created: ${r?.parties_created ?? 0}\n` +
      `Work orders linked: ${r?.work_orders_linked ?? 0}\n` +
      `Vendor bills linked: ${r?.bills_linked ?? 0}`
    )
    load()
  }

  const states = useMemo(() =>
    [...new Set(rows.map(r => r.state).filter(Boolean))].sort() as string[], [rows])

  const filtered = useMemo(() => rows.filter(v => {
    if (fCat && v.category !== fCat) return false
    if (fStatus && v.status !== fStatus) return false
    if (fState && v.state !== fState) return false
    const s = q.trim().toLowerCase()
    if (s && !`${v.name} ${v.company_name ?? ''} ${v.vendor_code ?? ''} ${v.gstin ?? ''} ${v.phone ?? ''} ${v.city ?? ''}`
      .toLowerCase().includes(s)) return false
    return true
  }), [rows, q, fCat, fStatus, fState])

  const kpi = useMemo(() => ({
    total: rows.length,
    active: rows.filter(v => v.status === 'Active').length,
    blacklisted: rows.filter(v => v.status === 'Blacklisted').length,
    payable: rows.reduce((n, v) => n + Math.max(0, Number(v.payable || 0)), 0),
    docAlerts: rows.filter(v => v.expired_docs > 0 || v.expiring_docs > 0).length,
  }), [rows])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendors</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            One record per vendor — their orders, bills, payments and history all hang off it.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={migrating} onClick={migrate}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync</span>
              {migrating ? 'Importing…' : 'Import Old Vendors'}
            </button>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Vendor
            </button>
          </div>
        )}
      </div>

      {kpi.docAlerts > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>description</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{kpi.docAlerts} vendor(s) have expired or expiring documents</b>
            <span className="text-[#dcc1ae]"> — GST certificates, licences or agreements need renewing.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Total Vendors" value={String(kpi.total)} />
        <K label="Active" value={String(kpi.active)} tone="emerald" />
        <K label="Blacklisted" value={String(kpi.blacklisted)} tone={kpi.blacklisted ? 'red' : undefined} />
        <K label="Total Payable" value={inr(kpi.payable)} tone={kpi.payable ? 'amber' : undefined} />
      </div>

      {/* filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <L label="Search">
          <input className="input" style={{ minWidth: 220 }} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Name, code, GSTIN, phone, city…" />
        </L>
        <L label="Category">
          <select className="input" value={fCat} onChange={e => setFCat(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </L>
        <L label="Status">
          <select className="input" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">All</option>
            <option>Active</option><option>Inactive</option><option>Blacklisted</option>
          </select>
        </L>
        <L label="State">
          <select className="input" value={fState} onChange={e => setFState(e.target.value)}>
            <option value="">All states</option>
            {states.map(s => <option key={s}>{s}</option>)}
          </select>
        </L>
        {(q || fCat || fStatus || fState) && (
          <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: '12px' }}
            onClick={() => { setQ(''); setFCat(''); setFStatus(''); setFState('') }}>Clear</button>
        )}
        <div className="ml-auto">
          <ExportButtons filename="vendors" title="Vendor Database" rows={filtered}
            columns={[
              { header: 'Code', get: (r: any) => r.vendor_code || '—' },
              { header: 'Vendor', get: (r: any) => r.name },
              { header: 'Company', get: (r: any) => r.company_name || '—' },
              { header: 'Category', get: (r: any) => r.category || '—' },
              { header: 'Status', get: (r: any) => r.status },
              { header: 'GSTIN', get: (r: any) => r.gstin || '—' },
              { header: 'PAN', get: (r: any) => r.pan || '—' },
              { header: 'Contact', get: (r: any) => r.contact_name || '—' },
              { header: 'Phone', get: (r: any) => r.phone || '—' },
              { header: 'Email', get: (r: any) => r.email || '—' },
              { header: 'City', get: (r: any) => r.city || '—' },
              { header: 'State', get: (r: any) => r.state || '—' },
              { header: 'Bank', get: (r: any) => r.bank_name || '—' },
              { header: 'Account No.', get: (r: any) => r.bank_account || '—' },
              { header: 'IFSC', get: (r: any) => r.bank_ifsc || '—' },
              { header: 'Projects', get: (r: any) => Number(r.project_count) },
              { header: 'Purchase Orders', get: (r: any) => Number(r.po_count) },
              { header: 'PO Value', get: (r: any) => Number(r.po_value) },
              { header: 'Work Orders', get: (r: any) => Number(r.wo_count) },
              { header: 'WO Value', get: (r: any) => Number(r.wo_value) },
              { header: 'Bills', get: (r: any) => Number(r.bill_count) },
              { header: 'Payable', get: (r: any) => Number(r.payable) },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Vendor', 'Category', 'Contact', 'Location', 'Projects', 'Orders', 'Payable', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(v => (
                <tr key={v.party_id}
                  className={`hover:bg-white/[0.02] cursor-pointer ${v.status === 'Blacklisted' ? 'bg-red-500/[0.04]' : ''} ${v.status === 'Inactive' ? 'opacity-50' : ''}`}
                  onClick={() => navigate(`/vendors/${v.party_id}`)}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{v.vendor_code || '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-[#e2e2e8] font-semibold">{v.name}</div>
                    {v.company_name && v.company_name !== v.name && (
                      <div className="text-[11px] text-[#dcc1ae]/60">{v.company_name}</div>
                    )}
                    {(v.expired_docs > 0 || v.expiring_docs > 0) && (
                      <div className="text-[10px] text-amber-400 mt-0.5">
                        {v.expired_docs > 0 ? `${v.expired_docs} doc(s) expired` : `${v.expiring_docs} expiring`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {v.category ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${CAT_STYLE[v.category] ?? ''}`}>
                        {v.category}
                      </span>
                    ) : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                    {v.contact_name && <div className="text-[#e2e2e8]">{v.contact_name}</div>}
                    {v.phone || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                    {v.city || '—'}{v.state ? `, ${v.state}` : ''}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{v.project_count}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-right whitespace-nowrap">
                    <div className="text-[#e2e2e8]">{v.po_count + v.wo_count}</div>
                    <div className="text-[10px] text-[#dcc1ae]/60">{inr(Number(v.po_value) + Number(v.wo_value))}</div>
                  </td>
                  <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(v.payable) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                    {Number(v.payable) > 0 ? inr(v.payable) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[v.status]}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                        onClick={() => { setEditing(v); setShowForm(true) }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
                  {rows.length === 0
                    ? 'No vendors yet. Click "Import Old Vendors" to bring across the ones already named on your work orders and bills.'
                    : 'No vendors match those filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <VendorForm editing={editing} onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

// =====================================================================
//  VENDOR FORM
// =====================================================================
function VendorForm({ editing, onClose, onSaved }: {
  editing: Vendor | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [company, setCompany] = useState(editing?.company_name ?? '')
  const [category, setCategory] = useState(editing?.category ?? 'Material Supplier')
  const [gstin, setGstin] = useState(editing?.gstin ?? '')
  const [pan, setPan] = useState(editing?.pan ?? '')
  const [contact, setContact] = useState(editing?.contact_name ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [phone2, setPhone2] = useState(editing?.phone_alt ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [city, setCity] = useState(editing?.city ?? '')
  const [state, setState] = useState(editing?.state ?? '')
  const [pincode, setPincode] = useState(editing?.pincode ?? '')
  const [bankName, setBankName] = useState(editing?.bank_name ?? '')
  const [bankAcc, setBankAcc] = useState(editing?.bank_account ?? '')
  const [ifsc, setIfsc] = useState(editing?.bank_ifsc ?? '')
  const [upi, setUpi] = useState(editing?.upi_id ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Active')
  const [reason, setReason] = useState(editing?.blacklist_reason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Vendor name is required.'); return }
    if (status === 'Blacklisted' && !reason.trim()) {
      setErr('Blacklisting a vendor needs a reason.'); return
    }
    setBusy(true); setErr(null)

    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', uid!).maybeSingle()

    const payload: any = {
      name: name.trim(), company_name: company || null, category,
      party_type: 'Vendor', status,
      blacklist_reason: status === 'Blacklisted' ? reason : null,
      active: status === 'Active',
      gstin: gstin || null, pan: pan || null,
      contact_name: contact || null, phone: phone || null, phone_alt: phone2 || null,
      email: email || null, address: address || null,
      city: city || null, state: state || null, pincode: pincode || null,
      bank_name: bankName || null, bank_account: bankAcc || null,
      bank_ifsc: ifsc || null, upi_id: upi || null,
    }

    let error
    if (editing) {
      ({ error } = await supabase.from('acc_parties').update(payload).eq('id', editing.party_id))
    } else {
      const { data: code } = await supabase.rpc('next_vendor_code')
      ;({ error } = await supabase.from('acc_parties').insert({
        ...payload, org_id: prof?.org_id, vendor_code: code, created_by: uid,
      }))
    }
    setBusy(false)
    if (error) {
      setErr(error.message.includes('duplicate')
        ? 'A vendor with this name already exists.'
        : error.message)
      return
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">
            {editing ? `Edit ${editing.name}` : 'New Vendor'}
          </h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* basics */}
          <div>
            <Sec>Basic Details</Sec>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Vendor Name *">
                <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </F>
              <F label="Company Name">
                <input className="input" value={company} onChange={e => setCompany(e.target.value)} />
              </F>
              <F label="Category *">
                <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </F>
              <F label="Status">
                <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                  <option>Active</option><option>Inactive</option><option>Blacklisted</option>
                </select>
              </F>
              {status === 'Blacklisted' && (
                <div className="sm:col-span-2">
                  <F label="Reason for blacklisting *">
                    <input className="input" value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="Repeated late delivery, quality failure…" />
                  </F>
                </div>
              )}
            </div>
          </div>

          {/* tax */}
          <div>
            <Sec>Tax</Sec>
            <div className="grid grid-cols-2 gap-4">
              <F label="GSTIN">
                <input className="input mono" value={gstin} maxLength={15}
                  onChange={e => setGstin(e.target.value.toUpperCase())} />
              </F>
              <F label="PAN">
                <input className="input mono" value={pan} maxLength={10}
                  onChange={e => setPan(e.target.value.toUpperCase())} />
              </F>
            </div>
          </div>

          {/* contact */}
          <div>
            <Sec>Contact</Sec>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Contact Person"><input className="input" value={contact} onChange={e => setContact(e.target.value)} /></F>
              <F label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></F>
              <F label="Phone"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></F>
              <F label="Alternate Phone"><input className="input" value={phone2} onChange={e => setPhone2(e.target.value)} /></F>
              <div className="sm:col-span-2">
                <F label="Address"><textarea className="input" rows={2} value={address} onChange={e => setAddress(e.target.value)} /></F>
              </div>
              <F label="City"><input className="input" value={city} onChange={e => setCity(e.target.value)} /></F>
              <F label="State"><input className="input" value={state} onChange={e => setState(e.target.value)} placeholder="Odisha" /></F>
              <F label="Pincode"><input className="input mono" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, ''))} maxLength={6} /></F>
            </div>
          </div>

          {/* bank */}
          <div>
            <Sec>Bank &amp; Payment</Sec>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <F label="Bank Name"><input className="input" value={bankName} onChange={e => setBankName(e.target.value)} /></F>
              <F label="Account Number"><input className="input mono" value={bankAcc} onChange={e => setBankAcc(e.target.value)} /></F>
              <F label="IFSC"><input className="input mono" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} maxLength={11} /></F>
              <F label="UPI ID"><input className="input mono" value={upi} onChange={e => setUpi(e.target.value)} placeholder="name@bank" /></F>
            </div>
          </div>

          <p className="text-[11px] text-[#dcc1ae]/50">
            An accounting ledger is created automatically under Sundry Creditors —
            so this vendor's outstanding and payments work straight away.
          </p>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Vendor'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3 pb-1.5 border-b border-white/[0.06]">{children}</div>
}
function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400'
    : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}