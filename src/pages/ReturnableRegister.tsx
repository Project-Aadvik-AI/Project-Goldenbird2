import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

// Returnable Register — who is holding returnable items (grinders, tools, plates)
// and how much is still outstanding. Derived from Issue vs Return movements of
// items flagged is_returnable. Read-only tracking; returns happen via Material Return.

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Row = {
  item_id: string; item_code: string | null; item_name: string
  warehouse_id: string; warehouse_name: string | null; project_id: string | null
  holder: string; qty_issued: number; qty_returned: number; outstanding: number
  last_issue_date: string | null
}

export default function ReturnableRegister() {
  const { activeProject } = useProject()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [holderFilter, setHolderFilter] = useState('')

  useEffect(() => { (async () => {
    setLoading(true)
    let query = supabase.from('inv_returnable_register').select('*').order('outstanding', { ascending: false })
    const { data } = await query
    setRows((data as Row[]) ?? [])
    setLoading(false)
  })() }, [])

  const scoped = useMemo(() =>
    rows.filter(r => activeProject ? r.project_id === activeProject.id : true),
  [rows, activeProject])

  const holders = useMemo(() => [...new Set(scoped.map(r => r.holder))].sort(), [scoped])

  const shown = useMemo(() => scoped
    .filter(r => !holderFilter || r.holder === holderFilter)
    .filter(r => !search ||
      r.item_name.toLowerCase().includes(search.toLowerCase()) ||
      r.holder.toLowerCase().includes(search.toLowerCase())),
  [scoped, holderFilter, search])

  const totalOutstanding = shown.reduce((a, r) => a + Number(r.outstanding || 0), 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>Returnable Items Register</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
          Grinders, tools, shuttering plates and other returnable stock currently out — who holds it and how much is still to come back.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <Kpi label="Outstanding (qty)" value={q(totalOutstanding)} accent />
        <Kpi label="Holders" value={String(holders.length)} />
        <Kpi label="Line items out" value={String(shown.length)} />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input className="input" style={{ maxWidth: 240 }} placeholder="Search item or holder…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input" style={{ maxWidth: 220 }} value={holderFilter} onChange={e => setHolderFilter(e.target.value)}>
          <option value="">All holders</option>
          {holders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <div className="ml-auto">
          <ExportButtons filename="returnable-register" title="Returnable Items Register" rows={shown}
            columns={[
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Holder', get: (r: any) => r.holder },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name || '—' },
              { header: 'Issued', get: (r: any) => Number(r.qty_issued) },
              { header: 'Returned', get: (r: any) => Number(r.qty_returned) },
              { header: 'Outstanding', get: (r: any) => Number(r.outstanding) },
              { header: 'Last Issue', get: (r: any) => r.last_issue_date || '—' },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Holder', 'Warehouse', 'Issued', 'Returned', 'Outstanding', 'Since'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shown.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  <div className="font-semibold text-[#e2e2e8]">{r.item_name}</div>
                  <div className="text-[10px] text-[#dcc1ae]/50">{r.item_code || '—'}</div>
                </td>
                <td className="px-3 py-2 text-[#e2e2e8]">{r.holder}</td>
                <td className="px-3 py-2 text-[#dcc1ae]/80">{r.warehouse_name || '—'}</td>
                <td className="px-3 py-2 font-mono text-[#dcc1ae]/70">{q(r.qty_issued)}</td>
                <td className="px-3 py-2 font-mono text-[#34d399]">{q(r.qty_returned)}</td>
                <td className="px-3 py-2 font-mono font-bold text-[#ffb87b]">{q(r.outstanding)}</td>
                <td className="px-3 py-2 text-[#dcc1ae]/60 whitespace-nowrap">{r.last_issue_date || '—'}</td>
              </tr>
            ))}
            {!shown.length && !loading && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-[#dcc1ae]/50">
                Nothing outstanding. Returnable items issued to holders will appear here until returned.
              </td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-sm text-[#dcc1ae]">Loading…</div>}
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#dcc1ae]/60">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${accent ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>{value}</div>
    </div>
  )
}