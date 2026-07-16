import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'

// ---------- types ----------
type Group = { id: string; name: string; nature: string; parent_id: string | null; is_system: boolean }
type Ledger = {
  id: string; name: string; code: string | null; group_id: string
  opening_balance: number; tax_kind: string | null; is_system: boolean; active: boolean
  bank_name: string | null; account_number: string | null; ifsc: string | null
}
type Party = {
  id: string; name: string; party_type: string; gstin: string | null; pan: string | null
  address: string | null; state: string | null; phone: string | null; email: string | null
  ledger_id: string | null; active: boolean
}
type Tax = {
  id: string; name: string; total_rate: number; cgst_rate: number; sgst_rate: number
  igst_rate: number; active: boolean
}
type Ded = {
  id: string; name: string; calc_mode: string; default_rate: number; rate_editable: boolean
  ledger_id: string | null; recoverable: boolean; active: boolean; sort_order: number
}
type Balance = {
  ledger_id: string; ledger_name: string; group_name: string; nature: string
  opening_balance: number; total_debit: number; total_credit: number; closing_balance: number
}

export const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Tab = 'coa' | 'parties' | 'taxes' | 'deductions' | 'vouchers'

export default function Accounting() {
  const { activeProject } = useProject()
  const { isAdmin, can } = useAuth()
  const [tab, setTab] = useState<Tab>('coa')
  const [seeded, setSeeded] = useState<boolean | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('acc_ledgers').select('id', { count: 'exact', head: true })
      setSeeded((count ?? 0) > 0)
    })()
  }, [])

  async function seed() {
    setSeeding(true)
    const { error } = await supabase.rpc('acc_seed_chart')
    setSeeding(false)
    if (error) { alert('Setup failed: ' + error.message); return }
    setSeeded(true)
  }

  if (!isAdmin && !can('accounting', 'view')) return <div className="p-8 text-center text-[#dcc1ae]">Accounting is restricted to administrators.</div>

  if (seeded === false) return (
    <div className="max-w-lg mx-auto mt-10 card p-8 text-center">
      <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '44px' }}>account_balance</span>
      <h1 className="font-headline text-xl font-semibold text-[#e2e2e8] mt-3">Set up Accounting</h1>
      <p className="text-[13px] text-[#dcc1ae] mt-2">
        This creates your Chart of Accounts with Tally-compatible groups (Sundry Debtors, Duties &amp; Taxes,
        Direct Expenses…), the core ledgers, default GST rates and standard deductions.
        Everything is editable afterwards — nothing is hardcoded.
      </p>
      <button className="btn btn-primary mt-5" disabled={seeding} onClick={seed}>
        {seeding ? 'Setting up…' : 'Create Chart of Accounts'}
      </button>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Accounting</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Double-entry books · Tally-compatible chart of accounts</p>
      </div>

      <div className="flex gap-1 mb-5 flex-wrap">
        {([
          ['coa', 'Chart of Accounts'], ['parties', 'Parties'], ['taxes', 'Tax Rates'],
          ['deductions', 'Deductions'], ['vouchers', 'Vouchers'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'coa' && <ChartOfAccounts />}
      {tab === 'parties' && <Parties />}
      {tab === 'taxes' && <TaxRates />}
      {tab === 'deductions' && <Deductions />}
      {tab === 'vouchers' && <Vouchers />}
    </div>
  )
}

// =====================================================================
//  CHART OF ACCOUNTS
// =====================================================================
function ChartOfAccounts() {
  const [groups, setGroups] = useState<Group[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ledger | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: g }, { data: l }, { data: b }] = await Promise.all([
      supabase.from('acc_groups').select('*').order('sort_order'),
      supabase.from('acc_ledgers').select('*').order('name'),
      supabase.from('acc_ledger_balances').select('*'),
    ])
    setGroups((g as Group[]) ?? [])
    setLedgers((l as Ledger[]) ?? [])
    setBalances((b as Balance[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])   // the chart of accounts is company-wide

  const balOf = (id: string) => balances.find(b => b.ledger_id === id)?.closing_balance ?? 0
  const groupName = (id: string) => groups.find(g => g.id === id)?.name ?? '—'

  // group ledgers under their account group
  const tree = useMemo(() => {
    const s = q.trim().toLowerCase()
    const filtered = s ? ledgers.filter(l => l.name.toLowerCase().includes(s)) : ledgers
    const byGroup = new Map<string, Ledger[]>()
    for (const l of filtered) {
      const arr = byGroup.get(l.group_id) ?? []
      arr.push(l)
      byGroup.set(l.group_id, arr)
    }
    return groups
      .filter(g => byGroup.has(g.id))
      .map(g => ({ group: g, ledgers: byGroup.get(g.id)! }))
  }, [groups, ledgers, q])

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <input className="input" style={{ maxWidth: 280 }} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search ledgers…" />
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Ledger
        </button>
      </div>

      {loading ? <div className="card p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
        <div className="space-y-3">
          {tree.map(({ group, ledgers: ls }) => {
            const groupTotal = ls.reduce((n, l) => n + balOf(l.id), 0)
            return (
              <div key={group.id} className="card overflow-hidden">
                <div className="px-4 py-2.5 bg-[#282a2e] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#e2e2e8]">{group.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#dcc1ae]/70 uppercase">{group.nature}</span>
                  </div>
                  <span className={`font-mono text-[13px] font-bold ${groupTotal >= 0 ? 'text-[#e2e2e8]' : 'text-amber-400'}`}>
                    {inr(Math.abs(groupTotal))} {groupTotal >= 0 ? 'Dr' : 'Cr'}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-white/[0.04]">
                    {ls.map(l => {
                      const bal = balOf(l.id)
                      return (
                        <tr key={l.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-[#e2e2e8]">
                            {l.name}
                            {l.is_system && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#dcc1ae]/50 uppercase">system</span>}
                            {!l.active && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 uppercase">inactive</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[#dcc1ae] whitespace-nowrap">
                            {inr(Math.abs(bal))} <span className="text-[10px] text-[#dcc1ae]/50">{bal >= 0 ? 'Dr' : 'Cr'}</span>
                          </td>
                          <td className="px-4 py-2 text-right w-20">
                            <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                              onClick={() => { setEditing(l); setShowForm(true) }}>Edit</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
          {!tree.length && <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">No ledgers match.</div>}
        </div>
      )}

      {showForm && <LedgerForm editing={editing} groups={groups} onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function LedgerForm({ editing, groups, onClose, onSaved }: {
  editing: Ledger | null; groups: Group[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [groupId, setGroupId] = useState(editing?.group_id ?? '')
  const [opening, setOpening] = useState(editing ? String(editing.opening_balance) : '0')
  const [openingSide, setOpeningSide] = useState<'dr' | 'cr'>(
    (editing?.opening_balance ?? 0) < 0 ? 'cr' : 'dr')
  const [bank, setBank] = useState(editing?.bank_name ?? '')
  const [acno, setAcno] = useState(editing?.account_number ?? '')
  const [ifsc, setIfsc] = useState(editing?.ifsc ?? '')
  const [active, setActive] = useState(editing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const selectedGroup = groups.find(g => g.id === groupId)
  const isBank = selectedGroup?.name === 'Bank Accounts'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !groupId) { setErr('Name and group are required.'); return }
    setBusy(true); setErr(null)
    const signed = (openingSide === 'cr' ? -1 : 1) * Math.abs(Number(opening) || 0)
    const payload: any = {
      name: name.trim(), group_id: groupId, opening_balance: signed, active,
      bank_name: isBank ? (bank || null) : null,
      account_number: isBank ? (acno || null) : null,
      ifsc: isBank ? (ifsc || null) : null,
    }
    const { error } = editing
      ? await supabase.from('acc_ledgers').update(payload).eq('id', editing.id)
      : await supabase.from('acc_ledgers').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{editing ? 'Edit Ledger' : 'New Ledger'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 space-y-4">
          <F label="Ledger Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></F>
          <F label="Under Group *">
            <select className="input" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">— Select —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.nature})</option>)}
            </select>
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label="Opening Balance">
              <input className="input mono" inputMode="decimal" value={opening}
                onChange={e => setOpening(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="Dr / Cr">
              <select className="input" value={openingSide} onChange={e => setOpeningSide(e.target.value as 'dr' | 'cr')}>
                <option value="dr">Debit (Dr)</option>
                <option value="cr">Credit (Cr)</option>
              </select>
            </F>
          </div>
          {isBank && (
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <F label="Bank Name"><input className="input" value={bank} onChange={e => setBank(e.target.value)} /></F>
              <div className="grid grid-cols-2 gap-4">
                <F label="Account Number"><input className="input mono" value={acno} onChange={e => setAcno(e.target.value)} /></F>
                <F label="IFSC"><input className="input mono" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} /></F>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
            <input type="checkbox" className="accent-[#ff8f00]" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        {err && <div className="px-5 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Ledger'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  PARTIES
// =====================================================================
function Parties() {
  const [rows, setRows] = useState<Party[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('acc_parties').select('*').order('name')
    setRows((data as Party[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? rows.filter(r => `${r.name} ${r.gstin ?? ''}`.toLowerCase().includes(s)) : rows
  }, [rows, q])

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <input className="input" style={{ maxWidth: 280 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search parties…" />
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Party
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Name', 'Type', 'GSTIN', 'PAN', 'State', 'Phone', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{p.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      p.party_type === 'Client' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : p.party_type === 'Vendor' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{p.party_type}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{p.gstin || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{p.pan || '—'}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{p.state || '—'}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{p.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                      onClick={() => { setEditing(p); setShowForm(true) }}>Edit</button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No parties yet. Add your clients (RITES, NALCO…) and vendors — a ledger is created automatically for each.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <PartyForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function PartyForm({ editing, onClose, onSaved }: { editing: Party | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState(editing?.party_type ?? 'Vendor')
  const [gstin, setGstin] = useState(editing?.gstin ?? '')
  const [pan, setPan] = useState(editing?.pan ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [state, setState] = useState(editing?.state ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Party name is required.'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), party_type: type, gstin: gstin || null, pan: pan || null,
      address: address || null, state: state || null, phone: phone || null, email: email || null,
    }
    const { error } = editing
      ? await supabase.from('acc_parties').update(payload).eq('id', editing.id)
      : await supabase.from('acc_parties').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{editing ? 'Edit Party' : 'New Party'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><F label="Party Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="RITES Ltd / ABC Traders" autoFocus /></F></div>
          <F label="Type *">
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              <option>Client</option><option>Vendor</option><option>Both</option>
            </select>
          </F>
          <F label="State"><input className="input" value={state} onChange={e => setState(e.target.value)} placeholder="Odisha" /></F>
          <F label="GSTIN"><input className="input mono" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} maxLength={15} /></F>
          <F label="PAN"><input className="input mono" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} maxLength={10} /></F>
          <F label="Phone"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></F>
          <F label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></F>
          <div className="sm:col-span-2"><F label="Address"><textarea className="input" rows={2} value={address} onChange={e => setAddress(e.target.value)} /></F></div>
        </div>
        <p className="px-5 text-[11px] text-[#dcc1ae]/50">A ledger is created automatically under Sundry Debtors (Client) or Sundry Creditors (Vendor).</p>
        {err && <div className="px-5 pt-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2 mt-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Party'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  TAX RATES
// =====================================================================
function TaxRates() {
  const [rows, setRows] = useState<Tax[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Tax | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('acc_tax_rates').select('*').order('total_rate', { ascending: false })
    setRows((data as Tax[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#dcc1ae]">Configure any GST structure. CGST + SGST + IGST must equal the total rate.</p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Tax Rate
        </button>
      </div>
      <div className="card overflow-hidden">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Name', 'Total %', 'CGST %', 'SGST %', 'IGST %', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map(t => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{t.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8]">{t.total_rate}%</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{t.cgst_rate}%</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{t.sgst_rate}%</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{t.igst_rate}%</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${t.active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-white/5 text-[#dcc1ae]/60 border-white/10'}`}>{t.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                      onClick={() => { setEditing(t); setShowForm(true) }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showForm && <TaxForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function TaxForm({ editing, onClose, onSaved }: { editing: Tax | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [cgst, setCgst] = useState(editing ? String(editing.cgst_rate) : '9')
  const [sgst, setSgst] = useState(editing ? String(editing.sgst_rate) : '9')
  const [igst, setIgst] = useState(editing ? String(editing.igst_rate) : '0')
  const [active, setActive] = useState(editing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const total = round2((Number(cgst) || 0) + (Number(sgst) || 0) + (Number(igst) || 0))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required.'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), total_rate: total,
      cgst_rate: Number(cgst) || 0, sgst_rate: Number(sgst) || 0, igst_rate: Number(igst) || 0,
      active,
    }
    const { error } = editing
      ? await supabase.from('acc_tax_rates').update(payload).eq('id', editing.id)
      : await supabase.from('acc_tax_rates').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">{editing ? 'Edit Tax Rate' : 'New Tax Rate'}</h3>
        <div className="space-y-3">
          <F label="Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="GST 18% (Intra-state)" autoFocus /></F>
          <div className="grid grid-cols-3 gap-3">
            <F label="CGST %"><input className="input mono" inputMode="decimal" value={cgst} onChange={e => setCgst(e.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="SGST %"><input className="input mono" inputMode="decimal" value={sgst} onChange={e => setSgst(e.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="IGST %"><input className="input mono" inputMode="decimal" value={igst} onChange={e => setIgst(e.target.value.replace(/[^\d.]/g, ''))} /></F>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2 flex justify-between">
            <span className="text-[12px] text-[#dcc1ae]">Total Rate</span>
            <span className="font-mono font-bold text-[#e2e2e8]">{total}%</span>
          </div>
          <p className="text-[11px] text-[#dcc1ae]/50">Intra-state: split CGST + SGST. Inter-state: use IGST only.</p>
          <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
            <input type="checkbox" className="accent-[#ff8f00]" checked={active} onChange={e => setActive(e.target.checked)} /> Active
          </label>
        </div>
        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  DEDUCTIONS
// =====================================================================
function Deductions() {
  const [rows, setRows] = useState<Ded[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ded | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: d }, { data: l }] = await Promise.all([
      supabase.from('acc_deduction_types').select('*').order('sort_order'),
      supabase.from('acc_ledgers').select('*').order('name'),
    ])
    setRows((d as Ded[]) ?? [])
    setLedgers((l as Ledger[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const ledgerName = (id: string | null) => (id ? ledgers.find(l => l.id === id)?.name : null) || '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#dcc1ae]">Every deduction used on RA bills. Rates are defaults — the accountant can override them per bill.</p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Deduction
        </button>
      </div>
      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Name', 'Mode', 'Default', 'Posts To Ledger', 'Recoverable', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map(d => (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{d.name}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae] capitalize">{d.calc_mode}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8]">
                    {d.calc_mode === 'percent' ? `${d.default_rate}%` : inr(d.default_rate)}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{ledgerName(d.ledger_id)}</td>
                  <td className="px-4 py-2.5">
                    {d.recoverable
                      ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-blue-500/10 text-blue-400 border-blue-500/20">Recoverable</span>
                      : <span className="text-[#dcc1ae]/40 text-[11px]">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${d.active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-white/5 text-[#dcc1ae]/60 border-white/10'}`}>{d.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase"
                      onClick={() => { setEditing(d); setShowForm(true) }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showForm && <DedForm editing={editing} ledgers={ledgers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function DedForm({ editing, ledgers, onClose, onSaved }: {
  editing: Ded | null; ledgers: Ledger[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [mode, setMode] = useState(editing?.calc_mode ?? 'percent')
  const [rate, setRate] = useState(editing ? String(editing.default_rate) : '')
  const [ledgerId, setLedgerId] = useState(editing?.ledger_id ?? '')
  const [recoverable, setRecoverable] = useState(editing?.recoverable ?? false)
  const [editableRate, setEditableRate] = useState(editing?.rate_editable ?? true)
  const [active, setActive] = useState(editing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required.'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), calc_mode: mode, default_rate: Number(rate) || 0,
      ledger_id: ledgerId || null, recoverable, rate_editable: editableRate, active,
    }
    const { error } = editing
      ? await supabase.from('acc_deduction_types').update(payload).eq('id', editing.id)
      : await supabase.from('acc_deduction_types').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">{editing ? 'Edit Deduction' : 'New Deduction'}</h3>
        <div className="space-y-3">
          <F label="Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Retention / GST TDS - CGST" autoFocus /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Calculation">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₹)</option>
              </select>
            </F>
            <F label={mode === 'percent' ? 'Default Rate (%)' : 'Default Amount (₹)'}>
              <input className="input mono" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
          </div>
          <F label="Posts To Ledger">
            <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
              <option value="">— Select ledger —</option>
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </F>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={recoverable} onChange={e => setRecoverable(e.target.checked)} />
              Recoverable (retention / security deposit — released later)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={editableRate} onChange={e => setEditableRate(e.target.checked)} />
              Rate can be changed per bill
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={active} onChange={e => setActive(e.target.checked)} /> Active
            </label>
          </div>
        </div>
        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  VOUCHERS  (manual entry + post + reverse)
// =====================================================================
type Voucher = {
  id: string; voucher_no: string; voucher_type: string; voucher_date: string
  narration: string | null; reference_no: string | null; status: string
  total_debit: number; total_credit: number; project_id: string | null
  reverses_id: string | null; reversed_by_id: string | null
  // which ledgers this voucher touched
  debit_ledgers?: string | null
  credit_ledgers?: string | null
  party_name?: string | null
}

function Vouchers() {
  const { activeProject } = useProject()
  const [rows, setRows] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')

  async function load() {
    setLoading(true)
    // vouchers belong to a project; show only the active one
    let qy = supabase.from('acc_voucher_summary').select('*')
      .order('voucher_date', { ascending: false }).limit(300)
    if (activeProject) qy = qy.eq('project_id', activeProject.id)
    const { data } = await qy
    // the view calls the pk `voucher_id`; the rest of this page expects `id`
    setRows(((data as any[]) ?? []).map(v => ({ ...v, id: v.voucher_id })) as Voucher[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter(r =>
    (!fType || r.voucher_type === fType) && (!fStatus || r.status === fStatus)
  ), [rows, fType, fStatus])

  async function post(v: Voucher) {
    if (!confirm(`Post ${v.voucher_no}?\n\nOnce posted, this voucher becomes immutable — corrections require a reversal voucher.`)) return
    const { error } = await supabase.rpc('acc_post_voucher', { p_voucher: v.id })
    if (error) { alert('Could not post:\n\n' + error.message); return }
    load()
  }
  async function reverse(v: Voucher) {
    const reason = prompt(`Reverse ${v.voucher_no}?\n\nThis creates a mirror-image voucher. Reason:`)
    if (reason === null) return
    const { error } = await supabase.rpc('acc_reverse_voucher', { p_voucher: v.id, p_reason: reason })
    if (error) { alert('Could not reverse:\n\n' + error.message); return }
    load()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <div className="flex gap-2">
          <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">All Types</option>
            {['Sales', 'Purchase', 'Payment', 'Receipt', 'Journal', 'Contra', 'Debit Note', 'Credit Note'].map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">All Status</option>
            <option>Draft</option><option>Posted</option><option>Reversed</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Voucher
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Date', 'Voucher No.', 'Type', 'Particulars (Dr → Cr)', 'Debit', 'Credit', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(v => {
                const balanced = round2(v.total_debit) === round2(v.total_credit)
                return (
                  <tr key={v.id} className={`hover:bg-white/[0.02] ${v.status === 'Reversed' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{v.voucher_date}</td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] font-semibold">{v.voucher_no}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{v.voucher_type}</td>
                    <td className="px-4 py-2.5 max-w-[300px]">
                      {v.debit_ledgers || v.credit_ledgers ? (
                        <>
                          <div className="text-[12px] text-[#e2e2e8] truncate" title={v.debit_ledgers ?? ''}>
                            <span className="text-[#dcc1ae]/50 font-mono text-[10px] mr-1">Dr</span>
                            {v.debit_ledgers || '—'}
                          </div>
                          <div className="text-[12px] text-[#dcc1ae] truncate" title={v.credit_ledgers ?? ''}>
                            <span className="text-[#dcc1ae]/50 font-mono text-[10px] mr-1">Cr</span>
                            {v.credit_ledgers || '—'}
                          </div>
                        </>
                      ) : <span className="text-[#dcc1ae]/40 text-[12px]">no lines</span>}
                      {v.narration && (
                        <div className="text-[10px] text-[#dcc1ae]/40 italic truncate mt-0.5" title={v.narration}>
                          {v.narration}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{inr(v.total_debit)}</td>
                    <td className={`px-4 py-2.5 font-mono text-right ${balanced ? 'text-[#e2e2e8]' : 'text-red-400 font-bold'}`}>{inr(v.total_credit)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                        v.status === 'Posted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : v.status === 'Reversed' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{v.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {v.status === 'Draft' && (
                        <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                          disabled={!balanced} title={balanced ? '' : 'Debit must equal Credit'}
                          onClick={() => post(v)}>Post</button>
                      )}
                      {v.status === 'Posted' && !v.reversed_by_id && (
                        <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline" onClick={() => reverse(v)}>Reverse</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No vouchers yet. Click "New Voucher" to make a manual entry (auto-posting from RA bills, expenses and payments comes in Phase 2).
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <VoucherForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

type Line = { ledger_id: string; debit: string; credit: string; remarks: string }

function VoucherForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { projects } = useProject()
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [type, setType] = useState('Journal')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [projectId, setProjectId] = useState('')
  const [narration, setNarration] = useState('')
  const [refNo, setRefNo] = useState('')
  const [lines, setLines] = useState<Line[]>([
    { ledger_id: '', debit: '', credit: '', remarks: '' },
    { ledger_id: '', debit: '', credit: '', remarks: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('acc_ledgers').select('*').eq('active', true).order('name')
      setLedgers((data as Ledger[]) ?? [])
    })()
  }, [])

  const totalDr = round2(lines.reduce((n, l) => n + (Number(l.debit) || 0), 0))
  const totalCr = round2(lines.reduce((n, l) => n + (Number(l.credit) || 0), 0))
  const diff = round2(totalDr - totalCr)
  const balanced = diff === 0 && totalDr > 0

  function setLine(i: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function addLine() { setLines(prev => [...prev, { ledger_id: '', debit: '', credit: '', remarks: '' }]) }
  function delLine(i: number) { setLines(prev => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const valid = lines.filter(l => l.ledger_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
    if (valid.length < 2) { setErr('At least two lines with a ledger and an amount are required.'); return }
    if (!balanced) { setErr(`Debit (${inr(totalDr)}) must equal Credit (${inr(totalCr)}). Difference: ${inr(Math.abs(diff))}`); return }

    setBusy(true); setErr(null)
    const { data: no, error: noErr } = await supabase.rpc('acc_next_voucher_no', { p_type: type })
    if (noErr) { setErr(noErr.message); setBusy(false); return }

    const { data: u } = await supabase.auth.getUser()
    const { data: v, error: vErr } = await supabase.from('acc_vouchers').insert({
      voucher_no: no, voucher_type: type, voucher_date: date,
      project_id: projectId || null, narration: narration || null,
      reference_no: refNo || null, status: 'Draft', created_by: u?.user?.id ?? null,
    }).select('id').single()
    if (vErr) { setErr(vErr.message); setBusy(false); return }

    const vid = (v as any).id
    const { error: lErr } = await supabase.from('acc_voucher_lines').insert(
      valid.map((l, i) => ({
        voucher_id: vid, ledger_id: l.ledger_id,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        project_id: projectId || null, remarks: l.remarks || null, line_no: i + 1,
      }))
    )
    setBusy(false)
    if (lErr) { setErr(lErr.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New Voucher</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <F label="Voucher Type *">
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {['Journal', 'Payment', 'Receipt', 'Contra', 'Sales', 'Purchase', 'Debit Note', 'Credit Note'].map(t => <option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="Date *"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          <F label="Project / Site">
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Reference No."><input className="input" value={refNo} onChange={e => setRefNo(e.target.value)} /></F>
        </div>

        {/* lines */}
        <div className="px-5 pb-2">
          <div className="rounded-lg border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Ledger', 'Debit', 'Credit', 'Remarks', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.ledger_id}
                        onChange={e => setLine(i, { ledger_id: e.target.value })}>
                        <option value="">— Select ledger —</option>
                        {ledgers.map(lg => <option key={lg.id} value={lg.id}>{lg.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 110 }}
                        inputMode="decimal" value={l.debit}
                        onChange={e => setLine(i, { debit: e.target.value.replace(/[^\d.]/g, ''), credit: '' })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 110 }}
                        inputMode="decimal" value={l.credit}
                        onChange={e => setLine(i, { credit: e.target.value.replace(/[^\d.]/g, ''), debit: '' })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.remarks}
                        onChange={e => setLine(i, { remarks: e.target.value })} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {lines.length > 2 && (
                        <button type="button" className="text-red-400 hover:text-red-300" onClick={() => delLine(i)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#282a2e]">
                <tr>
                  <td className="px-3 py-2 text-[11px] font-bold text-[#dcc1ae] uppercase">Total</td>
                  <td className="px-3 py-2 font-mono font-bold text-[#e2e2e8] text-right">{inr(totalDr)}</td>
                  <td className={`px-3 py-2 font-mono font-bold text-right ${balanced ? 'text-[#e2e2e8]' : 'text-red-400'}`}>{inr(totalCr)}</td>
                  <td className="px-3 py-2" colSpan={2}>
                    {diff !== 0 && <span className="text-[11px] text-red-400 font-semibold">Difference: {inr(Math.abs(diff))} — must be zero</span>}
                    {balanced && <span className="text-[11px] text-emerald-400 font-semibold">✓ Balanced</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="button" className="btn btn-ghost mt-2" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={addLine}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Add Line
          </button>
        </div>

        <div className="px-5 pb-3">
          <F label="Narration"><textarea className="input" rows={2} value={narration} onChange={e => setNarration(e.target.value)} placeholder="Being…" /></F>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy || !balanced}>
            {busy ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          Saved as Draft. Post it from the voucher list — the database enforces Debit = Credit and makes posted vouchers immutable.
        </p>
      </form>
    </div>
  ), document.body)
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}