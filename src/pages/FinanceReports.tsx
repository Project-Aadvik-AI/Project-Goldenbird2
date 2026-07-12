import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const drcr = (signed: number) => `${inr(Math.abs(signed))} ${signed >= 0 ? 'Dr' : 'Cr'}`

type GL = {
  line_id: string; voucher_id: string; voucher_no: string; voucher_type: string
  voucher_date: string; narration: string | null; party_name: string | null
  ledger_id: string; ledger_name: string; group_name: string; nature: string; is_direct: boolean
  debit: number; credit: number; project_id: string | null; project_name: string | null
  remarks: string | null
  contra_ledgers?: string | null      // the OTHER side of the entry
}
type TB = {
  ledger_id: string; ledger_name: string; group_name: string; nature: string; is_direct: boolean
  opening_balance: number; period_debit: number; period_credit: number
  closing_signed: number; closing_debit: number; closing_credit: number
}
type Out = {
  party_id: string; party_name: string; party_type: string
  balance_signed: number; receivable: number; payable: number
}
type Age = {
  party_name: string; party_type: string; voucher_no: string; voucher_date: string
  age_days: number; age_bucket: string; net_amount: number
}

type Rep = 'ledger' | 'daybook' | 'trial' | 'pnl' | 'bs' | 'project' | 'outstanding'

const REPORTS: [Rep, string, string][] = [
  ['ledger', 'General Ledger', 'Every transaction in a ledger with a running balance'],
  ['daybook', 'Day Book', 'All posted vouchers for a date range'],
  ['trial', 'Trial Balance', 'Every ledger — total debit must equal total credit'],
  ['pnl', 'Profit & Loss', 'Income less expenses → gross and net profit'],
  ['bs', 'Balance Sheet', 'Assets = Liabilities + Equity'],
  ['project', 'Project P&L', 'Revenue, cost and margin for each project'],
  ['outstanding', 'Outstanding & Ageing', 'Receivables from clients, payables to vendors'],
]

export default function FinanceReports() {
  const { isAdmin } = useAuth()
  const { projects } = useProject()
  const [rep, setRep] = useState<Rep>('trial')
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [projectId, setProjectId] = useState('')
  const [ledgerId, setLedgerId] = useState('')

  const [gl, setGl] = useState<GL[]>([])
  const [tb, setTb] = useState<TB[]>([])
  const [out, setOut] = useState<Out[]>([])
  const [age, setAge] = useState<Age[]>([])
  const [ledgers, setLedgers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: g }, { data: t }, { data: o }, { data: a }, { data: l }] = await Promise.all([
        supabase.from('acc_gl').select('*').gte('voucher_date', from).lte('voucher_date', to)
          .order('voucher_date').order('voucher_no'),
        supabase.from('acc_trial_balance').select('*').order('group_name').order('ledger_name'),
        supabase.from('acc_outstanding').select('*'),
        supabase.from('acc_ageing').select('*'),
        supabase.from('acc_ledgers').select('id, name').order('name'),
      ])
      setGl((g as GL[]) ?? [])
      setTb((t as TB[]) ?? [])
      setOut((o as Out[]) ?? [])
      setAge((a as Age[]) ?? [])
      setLedgers((l as any[]) ?? [])
      setLoading(false)
    })()
  }, [from, to])

  const glScoped = useMemo(() =>
    gl.filter(r => !projectId || r.project_id === projectId), [gl, projectId])

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Financial reports are restricted to administrators.</div>

  const meta = REPORTS.find(r => r[0] === rep)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Financial Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Built from posted vouchers only — draft vouchers are excluded, as in any accounting system.</p>
      </div>

      {/* controls */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="Report">
          <select className="input" value={rep} onChange={e => setRep(e.target.value as Rep)} style={{ minWidth: 190 }}>
            {REPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </L>
        <L label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></L>
        <L label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></L>
        <L label="Project">
          <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </L>
        {rep === 'ledger' && (
          <L label="Ledger">
            <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">— Select a ledger —</option>
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </L>
        )}
      </div>

      <p className="text-[12px] text-[#dcc1ae]/60 mb-4">{meta[2]}</p>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {rep === 'ledger' && <LedgerView gl={glScoped} ledgerId={ledgerId} tb={tb} />}
          {rep === 'daybook' && <DayBook gl={glScoped} />}
          {rep === 'trial' && <TrialBalance tb={tb} />}
          {rep === 'pnl' && <PnL gl={glScoped} scoped={!!projectId} />}
          {rep === 'bs' && <BalanceSheet tb={tb} />}
          {rep === 'project' && <ProjectPnL gl={gl} projects={projects} />}
          {rep === 'outstanding' && <Outstanding out={out} age={age} />}
        </>
      )}
    </div>
  )
}

// ---------------- General Ledger ----------------
function LedgerView({ gl, ledgerId, tb }: { gl: GL[]; ledgerId: string; tb: TB[] }) {
  if (!ledgerId) return <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">Select a ledger above to see its transactions.</div>
  const rows = gl.filter(r => r.ledger_id === ledgerId)
  const info = tb.find(t => t.ledger_id === ledgerId)
  const opening = info?.opening_balance ?? 0

  let run = opening
  const withRunning = rows.map(r => {
    run = r2(run + Number(r.debit || 0) - Number(r.credit || 0))
    return { ...r, running: run }
  })
  const totDr = r2(rows.reduce((n, r) => n + Number(r.debit || 0), 0))
  const totCr = r2(rows.reduce((n, r) => n + Number(r.credit || 0), 0))

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">{info?.ledger_name}</span>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-[#dcc1ae]/60">Closing: <b className="text-[#e2e2e8] font-mono">{drcr(info?.closing_signed ?? 0)}</b></span>
          <ExportButtons filename="general-ledger" title={`Ledger — ${info?.ledger_name}`} rows={withRunning}
            columns={[
              { header: 'Date', get: (r: any) => r.voucher_date },
              { header: 'Voucher No.', get: (r: any) => r.voucher_no },
              { header: 'Voucher Type', get: (r: any) => r.voucher_type },
              { header: 'Party', get: (r: any) => r.party_name || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Contra Ledger', get: (r: any) => r.contra_ledgers || '—' },
              { header: 'Narration', get: (r: any) => r.narration || '—' },
              { header: 'Remarks', get: (r: any) => r.remarks || '—' },
              { header: 'Reference', get: (r: any) => r.reference_no || '—' },
              { header: 'Debit', get: (r: any) => Number(r.debit) },
              { header: 'Credit', get: (r: any) => Number(r.credit) },
              { header: 'Running Balance', get: (r: any) => Math.abs(Number(r.running)) },
              { header: 'Dr/Cr', get: (r: any) => (Number(r.running) >= 0 ? 'Dr' : 'Cr') },
            ]} />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Date', 'Voucher', 'Type', 'Particulars (contra ledger)', 'Debit', 'Credit', 'Balance'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          <tr className="bg-white/[0.02]">
            <td className="px-4 py-2 text-[#dcc1ae]/60 text-[12px]" colSpan={4}>Opening balance</td>
            <td colSpan={2} />
            <td className="px-4 py-2 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{drcr(opening)}</td>
          </tr>
          {withRunning.map(r => (
            <tr key={r.line_id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
              <td className="px-4 py-2 font-mono text-[12px] text-[#e2e2e8]">{r.voucher_no}</td>
              <td className="px-4 py-2 text-[#dcc1ae]">{r.voucher_type}</td>
              <td className="px-4 py-2 max-w-[260px]">
                {r.contra_ledgers ? (
                  <div className="text-[#e2e2e8] truncate" title={r.contra_ledgers}>
                    <span className="text-[#dcc1ae]/50 text-[11px] mr-1">
                      {Number(r.debit) > 0 ? 'To' : 'By'}
                    </span>
                    {r.contra_ledgers}
                  </div>
                ) : <span className="text-[#dcc1ae]/40">—</span>}
                {(r.narration || r.remarks) && (
                  <div className="text-[10px] text-[#dcc1ae]/50 italic truncate">
                    {r.narration || r.remarks}
                  </div>
                )}
              </td>
              <td className="px-4 py-2 font-mono text-[#e2e2e8] text-right">{Number(r.debit) ? inr(r.debit) : '—'}</td>
              <td className="px-4 py-2 font-mono text-[#e2e2e8] text-right">{Number(r.credit) ? inr(r.credit) : '—'}</td>
              <td className="px-4 py-2 font-mono text-[#ffb87b] text-right whitespace-nowrap">{drcr(r.running)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No transactions in this period.</td></tr>}
        </tbody>
        <tfoot className="bg-[#282a2e]">
          <tr>
            <td className="px-4 py-2.5 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={4}>Total</td>
            <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right">{inr(totDr)}</td>
            <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right">{inr(totCr)}</td>
            <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right whitespace-nowrap">{drcr(run)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------- Day Book ----------------
function DayBook({ gl }: { gl: GL[] }) {
  // group lines by voucher
  const vouchers = useMemo(() => {
    const m = new Map<string, GL[]>()
    for (const r of gl) {
      const arr = m.get(r.voucher_id) ?? []
      arr.push(r); m.set(r.voucher_id, arr)
    }
    return [...m.values()].sort((a, b) =>
      a[0].voucher_date === b[0].voucher_date
        ? a[0].voucher_no.localeCompare(b[0].voucher_no)
        : a[0].voucher_date.localeCompare(b[0].voucher_date))
  }, [gl])

  const totDr = r2(gl.reduce((n, r) => n + Number(r.debit || 0), 0))

  return (
    <div>
      <div className="card p-3 mb-3 flex items-center justify-between">
        <span className="text-[12px] text-[#dcc1ae]">{vouchers.length} voucher(s) · Total {inr(totDr)}</span>
        <ExportButtons filename="day-book" title="Day Book" rows={gl}
          columns={[
            { header: 'Date', get: (r: any) => r.voucher_date },
            { header: 'Voucher No.', get: (r: any) => r.voucher_no },
            { header: 'Voucher Type', get: (r: any) => r.voucher_type },
            { header: 'Ledger', get: (r: any) => r.ledger_name },
            { header: 'Contra Ledger', get: (r: any) => r.contra_ledgers || '—' },
            { header: 'Group', get: (r: any) => r.group_name },
            { header: 'Party', get: (r: any) => r.party_name || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Debit', get: (r: any) => Number(r.debit) },
            { header: 'Credit', get: (r: any) => Number(r.credit) },
            { header: 'Narration', get: (r: any) => r.narration || '—' },
            { header: 'Line Remarks', get: (r: any) => r.remarks || '—' },
          ]} />
      </div>
      <div className="space-y-3">
        {vouchers.map(lines => {
          const h = lines[0]
          const dr = r2(lines.reduce((n, l) => n + Number(l.debit || 0), 0))
          return (
            <div key={h.voucher_id} className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-[#282a2e] flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-[#dcc1ae]">{h.voucher_date}</span>
                <span className="font-mono text-[13px] font-bold text-[#e2e2e8]">{h.voucher_no}</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#dcc1ae] uppercase">{h.voucher_type}</span>
                {h.project_name && <span className="text-[11px] text-[#dcc1ae]/60">{h.project_name}</span>}
                <span className="ml-auto font-mono text-[13px] font-bold text-[#e2e2e8]">{inr(dr)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/[0.04]">
                  {lines.map(l => (
                    <tr key={l.line_id}>
                      <td className="px-4 py-1.5 text-[#e2e2e8]">
                        <span className={Number(l.credit) > 0 ? 'pl-8 text-[#dcc1ae]' : ''}>{l.ledger_name}</span>
                      </td>
                      <td className="px-4 py-1.5 font-mono text-[#e2e2e8] text-right w-32">{Number(l.debit) ? inr(l.debit) : ''}</td>
                      <td className="px-4 py-1.5 font-mono text-[#e2e2e8] text-right w-32">{Number(l.credit) ? inr(l.credit) : ''}</td>
                    </tr>
                  ))}
                  {h.narration && (
                    <tr><td className="px-4 py-1.5 text-[11px] text-[#dcc1ae]/60 italic" colSpan={3}>({h.narration})</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        })}
        {!vouchers.length && <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">No posted vouchers in this period.</div>}
      </div>
    </div>
  )
}

// ---------------- Trial Balance ----------------
function TrialBalance({ tb }: { tb: TB[] }) {
  const rows = tb.filter(t => t.closing_debit > 0 || t.closing_credit > 0 || t.period_debit > 0 || t.period_credit > 0)
  const totDr = r2(rows.reduce((n, r) => n + Number(r.closing_debit || 0), 0))
  const totCr = r2(rows.reduce((n, r) => n + Number(r.closing_credit || 0), 0))
  const tallies = r2(totDr) === r2(totCr)

  return (
    <div>
      <div className={`card p-4 mb-4 flex items-center gap-2 ${tallies ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
        <span className={`material-symbols-outlined ${tallies ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontSize: '20px' }}>
          {tallies ? 'check_circle' : 'error'}
        </span>
        <span className={`text-[13px] font-semibold ${tallies ? 'text-emerald-400' : 'text-red-400'}`}>
          {tallies
            ? `Trial balance tallies — ${inr(totDr)} Dr = ${inr(totCr)} Cr`
            : `MISMATCH of ${inr(Math.abs(totDr - totCr))} — the books do not tally`}
        </span>
        <div className="ml-auto">
          <ExportButtons filename="trial-balance" title="Trial Balance" rows={rows}
            columns={[
              { header: 'Ledger', get: (r: any) => r.ledger_name },
              { header: 'Group', get: (r: any) => r.group_name },
              { header: 'Nature', get: (r: any) => r.nature },
              { header: 'Type', get: (r: any) => (r.is_direct ? 'Direct' : 'Indirect') },
              { header: 'Opening Balance', get: (r: any) => Number(r.opening_balance) },
              { header: 'Opening Dr/Cr', get: (r: any) => (Number(r.opening_balance) >= 0 ? 'Dr' : 'Cr') },
              { header: 'Period Debit', get: (r: any) => Number(r.period_debit) },
              { header: 'Period Credit', get: (r: any) => Number(r.period_credit) },
              { header: 'Net Movement', get: (r: any) => r2(Number(r.period_debit) - Number(r.period_credit)) },
              { header: 'Closing Debit', get: (r: any) => Number(r.closing_debit) },
              { header: 'Closing Credit', get: (r: any) => Number(r.closing_credit) },
              { header: 'Closing Balance', get: (r: any) => Math.abs(Number(r.closing_signed)) },
              { header: 'Closing Dr/Cr', get: (r: any) => (Number(r.closing_signed) >= 0 ? 'Dr' : 'Cr') },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Ledger', 'Group', 'Opening', 'Debit', 'Credit', 'Closing'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.ledger_id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2 text-[#e2e2e8] font-medium">{r.ledger_name}</td>
                <td className="px-4 py-2 text-[#dcc1ae]">{r.group_name}</td>
                <td className="px-4 py-2 font-mono text-[#dcc1ae]/70 text-right whitespace-nowrap">
                  {Number(r.opening_balance) ? drcr(r.opening_balance) : '—'}
                </td>
                <td className="px-4 py-2 font-mono text-[#e2e2e8] text-right">{Number(r.closing_debit) ? inr(r.closing_debit) : '—'}</td>
                <td className="px-4 py-2 font-mono text-[#e2e2e8] text-right">{Number(r.closing_credit) ? inr(r.closing_credit) : '—'}</td>
                <td className="px-4 py-2 font-mono text-[#ffb87b] text-right whitespace-nowrap">{drcr(r.closing_signed)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[#282a2e]">
            <tr>
              <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={3}>Total</td>
              <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8] text-right">{inr(totDr)}</td>
              <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8] text-right">{inr(totCr)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`text-[11px] font-bold uppercase ${tallies ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tallies ? '✓ Tallies' : '✗ Mismatch'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ---------------- Profit & Loss ----------------
function PnL({ gl, scoped }: { gl: GL[]; scoped: boolean }) {
  const inc = gl.filter(r => r.nature === 'Income')
  const exp = gl.filter(r => r.nature === 'Expense')

  const byLedger = (rows: GL[], income: boolean) => {
    const m = new Map<string, { name: string; direct: boolean; amount: number }>()
    for (const r of rows) {
      const amt = income ? Number(r.credit || 0) - Number(r.debit || 0)
                         : Number(r.debit || 0) - Number(r.credit || 0)
      const cur = m.get(r.ledger_id) ?? { name: r.ledger_name, direct: r.is_direct, amount: 0 }
      cur.amount = r2(cur.amount + amt)
      m.set(r.ledger_id, cur)
    }
    return [...m.values()].filter(x => x.amount !== 0).sort((a, b) => b.amount - a.amount)
  }

  const incRows = byLedger(inc, true)
  const expRows = byLedger(exp, false)

  const directInc = r2(incRows.filter(r => r.direct).reduce((n, r) => n + r.amount, 0))
  const indirectInc = r2(incRows.filter(r => !r.direct).reduce((n, r) => n + r.amount, 0))
  const directExp = r2(expRows.filter(r => r.direct).reduce((n, r) => n + r.amount, 0))
  const indirectExp = r2(expRows.filter(r => !r.direct).reduce((n, r) => n + r.amount, 0))

  const grossProfit = r2(directInc - directExp)
  const netProfit = r2(grossProfit + indirectInc - indirectExp)
  const margin = directInc ? Math.round(netProfit / directInc * 1000) / 10 : 0

  // export rows: every income & expense ledger + the summary lines
  const pnlExport = [
    ...incRows.map(r => ({ Section: 'Income', Type: r.direct ? 'Direct' : 'Indirect', Ledger: r.name, Amount: r.amount })),
    ...expRows.map(r => ({ Section: 'Expenses', Type: r.direct ? 'Direct' : 'Indirect', Ledger: r.name, Amount: r.amount })),
    { Section: 'SUMMARY', Type: '', Ledger: 'Direct Income', Amount: directInc },
    { Section: 'SUMMARY', Type: '', Ledger: 'Direct Expenses', Amount: directExp },
    { Section: 'SUMMARY', Type: '', Ledger: 'Gross Profit', Amount: grossProfit },
    { Section: 'SUMMARY', Type: '', Ledger: 'Indirect Income', Amount: indirectInc },
    { Section: 'SUMMARY', Type: '', Ledger: 'Indirect Expenses', Amount: indirectExp },
    { Section: 'SUMMARY', Type: '', Ledger: 'NET PROFIT', Amount: netProfit },
  ]

  return (
    <div>
      <div className="flex justify-end mb-3">
        <ExportButtons filename="profit-and-loss" title="Profit & Loss" rows={pnlExport}
          columns={[
            { header: 'Section', get: (r: any) => r.Section },
            { header: 'Direct / Indirect', get: (r: any) => r.Type },
            { header: 'Ledger', get: (r: any) => r.Ledger },
            { header: 'Amount', get: (r: any) => Number(r.Amount) },
          ]} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Direct Income" value={inr(directInc)} />
        <K label="Direct Expenses" value={inr(directExp)} tone="red" />
        <K label="Gross Profit" value={inr(grossProfit)} tone={grossProfit >= 0 ? 'emerald' : 'red'} />
        <K label={`Net Profit${margin ? ` (${margin}%)` : ''}`} value={inr(netProfit)} tone={netProfit >= 0 ? 'emerald' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Side title="Income" rows={incRows} total={r2(directInc + indirectInc)} tone="emerald" />
        <Side title="Expenses" rows={expRows} total={r2(directExp + indirectExp)} tone="red" />
      </div>

      <div className={`card p-5 mt-5 ${netProfit >= 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold text-[#e2e2e8] uppercase tracking-wide">
            {netProfit >= 0 ? 'Net Profit' : 'Net Loss'} {scoped && <span className="text-[11px] text-[#dcc1ae]/60 normal-case">(this project)</span>}
          </span>
          <span className={`font-mono text-[26px] font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {inr(Math.abs(netProfit))}
          </span>
        </div>
      </div>
    </div>
  )
}

function Side({ title, rows, total, tone }: {
  title: string; rows: { name: string; direct: boolean; amount: number }[]; total: number; tone: 'emerald' | 'red'
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">{title}</span>
        <span className={`font-mono text-[13px] font-bold ${c}`}>{inr(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map(r => (
            <tr key={r.name} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2 text-[#e2e2e8]">
                {r.name}
                {r.direct && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#dcc1ae]/50 uppercase">direct</span>}
              </td>
              <td className="px-4 py-2 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.amount)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td className="px-4 py-6 text-center text-[#dcc1ae]/50 text-[12px]" colSpan={2}>Nothing recorded.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Balance Sheet ----------------
function BalanceSheet({ tb }: { tb: TB[] }) {
  const group = (nature: string) => {
    const m = new Map<string, { group: string; ledgers: { name: string; amount: number }[]; total: number }>()
    for (const t of tb.filter(x => x.nature === nature)) {
      const amt = nature === 'Asset' ? Number(t.closing_signed) : -Number(t.closing_signed)
      if (r2(amt) === 0) continue
      const g = m.get(t.group_name) ?? { group: t.group_name, ledgers: [], total: 0 }
      g.ledgers.push({ name: t.ledger_name, amount: r2(amt) })
      g.total = r2(g.total + amt)
      m.set(t.group_name, g)
    }
    return [...m.values()]
  }

  const assets = group('Asset')
  const liabs = group('Liability')
  const equity = group('Equity')

  const totalAssets = r2(assets.reduce((n, g) => n + g.total, 0))
  const totalLiab = r2(liabs.reduce((n, g) => n + g.total, 0))
  const totalEquity = r2(equity.reduce((n, g) => n + g.total, 0))

  // profit for the period must be carried into equity for the sheet to balance
  const income = tb.filter(t => t.nature === 'Income').reduce((n, t) => n + -Number(t.closing_signed), 0)
  const expense = tb.filter(t => t.nature === 'Expense').reduce((n, t) => n + Number(t.closing_signed), 0)
  const profit = r2(income - expense)

  const rhs = r2(totalLiab + totalEquity + profit)
  const balanced = r2(totalAssets) === rhs

  const bsExport = [
    ...assets.flatMap(g => [
      { Section: 'ASSETS', Group: g.group, Ledger: '', Amount: g.total },
      ...g.ledgers.map(l => ({ Section: 'ASSETS', Group: g.group, Ledger: l.name, Amount: l.amount })),
    ]),
    { Section: 'ASSETS', Group: 'TOTAL ASSETS', Ledger: '', Amount: totalAssets },
    ...liabs.flatMap(g => [
      { Section: 'LIABILITIES', Group: g.group, Ledger: '', Amount: g.total },
      ...g.ledgers.map(l => ({ Section: 'LIABILITIES', Group: g.group, Ledger: l.name, Amount: l.amount })),
    ]),
    ...equity.flatMap(g => [
      { Section: 'EQUITY', Group: g.group, Ledger: '', Amount: g.total },
      ...g.ledgers.map(l => ({ Section: 'EQUITY', Group: g.group, Ledger: l.name, Amount: l.amount })),
    ]),
    { Section: 'EQUITY', Group: 'Profit for the period', Ledger: '', Amount: profit },
    { Section: 'TOTAL', Group: 'LIABILITIES + EQUITY + PROFIT', Ledger: '', Amount: rhs },
  ]

  return (
    <div>
      <div className="flex justify-end mb-3">
        <ExportButtons filename="balance-sheet" title="Balance Sheet" rows={bsExport}
          columns={[
            { header: 'Section', get: (r: any) => r.Section },
            { header: 'Group', get: (r: any) => r.Group },
            { header: 'Ledger', get: (r: any) => r.Ledger },
            { header: 'Amount', get: (r: any) => Number(r.Amount) },
          ]} />
      </div>
      <div className={`card p-4 mb-4 flex items-center gap-2 ${balanced ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
        <span className={`material-symbols-outlined ${balanced ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontSize: '20px' }}>
          {balanced ? 'check_circle' : 'error'}
        </span>
        <span className={`text-[13px] font-semibold ${balanced ? 'text-emerald-400' : 'text-red-400'}`}>
          {balanced
            ? `Balance sheet balances — Assets ${inr(totalAssets)} = Liabilities + Equity + Profit ${inr(rhs)}`
            : `OUT OF BALANCE by ${inr(Math.abs(totalAssets - rhs))}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BsSide title="Assets" groups={assets} total={totalAssets} />
        <div className="space-y-5">
          <BsSide title="Liabilities" groups={liabs} total={totalLiab} />
          <BsSide title="Equity" groups={equity} total={totalEquity}
            extra={{ label: profit >= 0 ? 'Profit for the period' : 'Loss for the period', amount: profit }} />
        </div>
      </div>
    </div>
  )
}

function BsSide({ title, groups, total, extra }: {
  title: string
  groups: { group: string; ledgers: { name: string; amount: number }[]; total: number }[]
  total: number
  extra?: { label: string; amount: number }
}) {
  const grand = r2(total + (extra?.amount ?? 0))
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">{title}</span>
        <span className="font-mono text-[13px] font-bold text-[#e2e2e8]">{inr(grand)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-white/[0.04]">
          {groups.map(g => (
            <>
              <tr key={g.group} className="bg-white/[0.02]">
                <td className="px-4 py-1.5 text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wide">{g.group}</td>
                <td className="px-4 py-1.5 font-mono text-[#dcc1ae] text-right">{inr(g.total)}</td>
              </tr>
              {g.ledgers.map(l => (
                <tr key={g.group + l.name} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-1.5 pl-8 text-[#e2e2e8]">{l.name}</td>
                  <td className="px-4 py-1.5 font-mono text-[#e2e2e8] text-right">{inr(l.amount)}</td>
                </tr>
              ))}
            </>
          ))}
          {extra && r2(extra.amount) !== 0 && (
            <tr className="bg-white/[0.02]">
              <td className="px-4 py-1.5 text-[12px] font-bold text-[#ffb87b] uppercase">{extra.label}</td>
              <td className={`px-4 py-1.5 font-mono text-right font-bold ${extra.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {inr(extra.amount)}
              </td>
            </tr>
          )}
          {!groups.length && !extra && <tr><td className="px-4 py-6 text-center text-[#dcc1ae]/50 text-[12px]" colSpan={2}>Nothing recorded.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Project P&L ----------------
function ProjectPnL({ gl, projects }: { gl: GL[]; projects: { id: string; name: string }[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; cost: number }>()
    for (const r of gl) {
      if (!r.project_id) continue
      const cur = m.get(r.project_id) ?? { name: r.project_name || 'Unknown', revenue: 0, cost: 0 }
      if (r.nature === 'Income') cur.revenue = r2(cur.revenue + Number(r.credit || 0) - Number(r.debit || 0))
      if (r.nature === 'Expense') cur.cost = r2(cur.cost + Number(r.debit || 0) - Number(r.credit || 0))
      m.set(r.project_id, cur)
    }
    return [...m.entries()].map(([id, v]) => {
      const margin = r2(v.revenue - v.cost)
      const pct = v.revenue ? Math.round(margin / v.revenue * 1000) / 10 : 0
      return { id, ...v, margin, pct }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [gl])

  const totRev = r2(rows.reduce((n, r) => n + r.revenue, 0))
  const totCost = r2(rows.reduce((n, r) => n + r.cost, 0))
  const totMargin = r2(totRev - totCost)

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <K label="Total Revenue" value={inr(totRev)} />
        <K label="Total Cost" value={inr(totCost)} tone="red" />
        <K label="Margin" value={inr(totMargin)} tone={totMargin >= 0 ? 'emerald' : 'red'} />
      </div>
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Project-wise P&amp;L</span>
          <ExportButtons filename="project-pnl" title="Project P&L" rows={rows}
            columns={[
              { header: 'Project', get: (r: any) => r.name },
              { header: 'Revenue', get: (r: any) => Number(r.revenue) },
              { header: 'Cost', get: (r: any) => Number(r.cost) },
              { header: 'Margin', get: (r: any) => Number(r.margin) },
              { header: 'Margin %', get: (r: any) => Number(r.pct) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Project', 'Revenue', 'Cost', 'Margin', 'Margin %'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.name}</td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{inr(r.revenue)}</td>
                <td className="px-4 py-2.5 font-mono text-red-400 text-right">{inr(r.cost)}</td>
                <td className={`px-4 py-2.5 font-mono font-bold text-right ${r.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{inr(r.margin)}</td>
                <td className={`px-4 py-2.5 font-mono text-right ${r.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pct}%</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">
              No project-tagged transactions yet. Vouchers need a project to appear here.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Outstanding & Ageing ----------------
function Outstanding({ out, age }: { out: Out[]; age: Age[] }) {
  const receivables = out.filter(o => o.receivable > 0.009)
  const payables = out.filter(o => o.payable > 0.009)
  const totRec = r2(receivables.reduce((n, o) => n + o.receivable, 0))
  const totPay = r2(payables.reduce((n, o) => n + o.payable, 0))

  const buckets = ['0-30', '31-60', '61-90', '90+']
  const ageOf = (partyName: string) => {
    const b: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    for (const a of age.filter(x => x.party_name === partyName)) {
      b[a.age_bucket] = r2((b[a.age_bucket] ?? 0) + Number(a.net_amount || 0))
    }
    return b
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <K label="Total Receivable (clients owe us)" value={inr(totRec)} tone="emerald" />
        <K label="Total Payable (we owe vendors)" value={inr(totPay)} tone="red" />
      </div>

      <OutTable title="Receivables — Clients" rows={receivables} amountKey="receivable" buckets={buckets} ageOf={ageOf} />
      <div className="h-5" />
      <OutTable title="Payables — Vendors" rows={payables} amountKey="payable" buckets={buckets} ageOf={ageOf} />
    </div>
  )
}

function OutTable({ title, rows, amountKey, buckets, ageOf }: {
  title: string; rows: Out[]; amountKey: 'receivable' | 'payable'
  buckets: string[]; ageOf: (n: string) => Record<string, number>
}) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">{title}</span>
        <ExportButtons filename={amountKey} title={title} rows={rows}
          columns={[
            { header: 'Party', get: (r: any) => r.party_name },
            { header: 'Party Type', get: (r: any) => r.party_type },
            { header: 'Outstanding', get: (r: any) => Number(r[amountKey]) },
            { header: '0-30 days', get: (r: any) => Math.abs(ageOf(r.party_name)['0-30'] ?? 0) },
            { header: '31-60 days', get: (r: any) => Math.abs(ageOf(r.party_name)['31-60'] ?? 0) },
            { header: '61-90 days', get: (r: any) => Math.abs(ageOf(r.party_name)['61-90'] ?? 0) },
            { header: '90+ days', get: (r: any) => Math.abs(ageOf(r.party_name)['90+'] ?? 0) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Party', 'Outstanding', ...buckets.map(b => `${b} days`)].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(o => {
            const b = ageOf(o.party_name)
            return (
              <tr key={o.party_id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{o.party_name}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right whitespace-nowrap">{inr(o[amountKey])}</td>
                {buckets.map(k => (
                  <td key={k} className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${k === '90+' && Math.abs(b[k]) > 0 ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {Math.abs(b[k] ?? 0) > 0.009 ? inr(Math.abs(b[k])) : '—'}
                  </td>
                ))}
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={2 + buckets.length} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">Nothing outstanding.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- shared ----------------
function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}