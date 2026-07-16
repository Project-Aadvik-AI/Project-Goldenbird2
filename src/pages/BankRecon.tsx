import { useEffect, useMemo, useRef, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type BankLedger = { id: string; name: string; bank_name: string | null; account_number: string | null }
type Line = {
  id: string; txn_date: string; description: string | null; reference: string | null
  withdrawal: number; deposit: number; balance: number | null; status: string
}
type Summary = {
  ledger_id: string; ledger_name: string; bank_name: string | null
  book_balance: number; statement_balance: number | null
  total_lines: number; matched_lines: number; unmatched_lines: number
}
type Ledger = { id: string; name: string }

// what a bank column could be called — used to auto-guess the mapping
const GUESS: Record<string, string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'post date', 'tran date'],
  description: ['description', 'narration', 'particulars', 'remarks', 'details', 'transaction remarks'],
  reference: ['ref', 'reference', 'cheque', 'chq', 'utr', 'ref no', 'cheque no', 'instrument'],
  withdrawal: ['withdrawal', 'debit', 'dr', 'withdrawal amt', 'withdrawal (dr)', 'debit amount', 'paid out'],
  deposit: ['deposit', 'credit', 'cr', 'deposit amt', 'deposit (cr)', 'credit amount', 'paid in'],
  balance: ['balance', 'closing balance', 'running balance', 'bal'],
}

export default function BankRecon() {
  const { isAdmin, can } = useAuth()
  const [banks, setBanks] = useState<BankLedger[]>([])
  const [ledgerId, setLedgerId] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [matching, setMatching] = useState(false)
  const [filter, setFilter] = useState<'all' | 'Unmatched' | 'Matched'>('all')
  const [createFor, setCreateFor] = useState<Line | null>(null)

  async function loadBanks() {
    const { data: g } = await supabase.from('acc_groups').select('id').eq('name', 'Bank Accounts').maybeSingle()
    if (!g) { setBanks([]); setLoading(false); return }
    const { data } = await supabase.from('acc_ledgers')
      .select('id, name, bank_name, account_number').eq('group_id', (g as any).id).order('name')
    const list = (data as BankLedger[]) ?? []
    setBanks(list)
    if (list.length && !ledgerId) setLedgerId(list[0].id)
    setLoading(false)
  }
  useEffect(() => { loadBanks() }, [])

  async function loadLines() {
    if (!ledgerId) { setLines([]); setSummary(null); return }
    const [{ data: l }, { data: s }] = await Promise.all([
      supabase.from('bank_statement_lines').select('*').eq('ledger_id', ledgerId)
        .order('txn_date', { ascending: false }),
      supabase.from('bank_recon_summary').select('*').eq('ledger_id', ledgerId).maybeSingle(),
    ])
    setLines((l as Line[]) ?? [])
    setSummary((s as Summary) ?? null)
  }
  useEffect(() => { loadLines() }, [ledgerId])

  async function autoMatch() {
    if (!ledgerId) return
    setMatching(true)
    const { data, error } = await supabase.rpc('bank_auto_match', { p_ledger: ledgerId, p_days: 7 })
    setMatching(false)
    if (error) { appAlert('Auto-match failed:\n\n' + error.message); return }
    appAlert(`Auto-matched ${data ?? 0} statement line(s) to existing vouchers.`)
    loadLines()
  }

  async function unmatch(lineId: string) {
    await supabase.from('bank_matches').delete().eq('line_id', lineId)
    loadLines()
  }

  const shown = useMemo(() =>
    filter === 'all' ? lines : lines.filter(l => l.status === filter), [lines, filter])

  const diff = summary
    ? r2(Number(summary.book_balance || 0) - Number(summary.statement_balance || 0))
    : 0
  const reconciled = Math.abs(diff) < 0.01

  if (!isAdmin && !can('bank_recon', 'view')) return <div className="p-8 text-center text-[#dcc1ae]">Bank reconciliation is restricted to administrators.</div>
  if (loading) return <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div>

  if (!banks.length) return (
    <div className="max-w-lg mx-auto mt-10 card p-8 text-center">
      <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '40px' }}>account_balance</span>
      <h1 className="font-headline text-xl font-semibold text-[#e2e2e8] mt-3">No bank accounts yet</h1>
      <p className="text-[13px] text-[#dcc1ae] mt-2">
        Create a bank ledger first: <b>Accounting → Chart of Accounts → New Ledger</b>,
        and put it under the <b>Bank Accounts</b> group.
      </p>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Bank Reconciliation</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Import your statement, match it to your books, and reconcile the difference.</p>
      </div>

      {/* controls */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="Bank Account">
          <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)} style={{ minWidth: 220 }}>
            {banks.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}{b.account_number ? ` · ${b.account_number}` : ''}
              </option>
            ))}
          </select>
        </L>
        <button className="btn btn-primary" onClick={() => setShowImport(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span> Import Statement
        </button>
        <button className="btn btn-ghost" disabled={matching || !lines.length} onClick={autoMatch}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>auto_fix_high</span>
          {matching ? 'Matching…' : 'Auto-Match'}
        </button>
      </div>

      {/* BRS summary */}
      {summary && (
        <div className={`card p-5 mb-5 ${reconciled ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-amber-500/5 border-amber-500/15'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Stat label="Book Balance" value={inr(Number(summary.book_balance || 0))} />
            <Stat label="Statement Balance" value={summary.statement_balance != null ? inr(Number(summary.statement_balance)) : '—'} />
            <Stat label="Difference" value={inr(Math.abs(diff))} tone={reconciled ? 'emerald' : 'amber'} />
            <Stat label="Matched" value={`${summary.matched_lines} / ${summary.total_lines}`} tone="emerald" />
            <Stat label="Unmatched" value={String(summary.unmatched_lines)} tone={summary.unmatched_lines ? 'amber' : undefined} />
          </div>
          <div className={`mt-4 pt-3 border-t border-white/[0.06] text-[13px] font-semibold flex items-center gap-2 ${reconciled ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{reconciled ? 'check_circle' : 'info'}</span>
            {reconciled
              ? 'Reconciled — your books agree with the bank statement.'
              : `Difference of ${inr(Math.abs(diff))} — match the remaining lines, or create vouchers for bank charges/interest.`}
          </div>
        </div>
      )}

      {/* lines */}
      <div className="flex gap-1 mb-3">
        {(['all', 'Unmatched', 'Matched'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
              filter === f ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                           : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {f === 'all' ? `All (${lines.length})`
              : `${f} (${lines.filter(l => l.status === f).length})`}
          </button>
        ))}
        <div className="ml-auto">
          <ExportButtons filename="bank-statement" title="Bank Statement" rows={shown}
            columns={[
              { header: 'Date', get: (r: any) => r.txn_date },
              { header: 'Description', get: (r: any) => r.description || '—' },
              { header: 'Reference', get: (r: any) => r.reference || '—' },
              { header: 'Withdrawal', get: (r: any) => Number(r.withdrawal) },
              { header: 'Deposit', get: (r: any) => Number(r.deposit) },
              { header: 'Balance', get: (r: any) => Number(r.balance ?? 0) },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Balance', 'Status', ''].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shown.map(l => (
              <tr key={l.id} className={`hover:bg-white/[0.02] ${l.status === 'Unmatched' ? 'bg-amber-500/[0.04]' : ''}`}>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{l.txn_date}</td>
                <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[280px] truncate" title={l.description || ''}>{l.description || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{l.reference || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-red-400 text-right whitespace-nowrap">{l.withdrawal ? inr(l.withdrawal) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{l.deposit ? inr(l.deposit) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{l.balance != null ? inr(l.balance) : '—'}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                    l.status === 'Matched' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{l.status}</span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {l.status === 'Unmatched' ? (
                    <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline"
                      onClick={() => setCreateFor(l)}>Create Voucher</button>
                  ) : (
                    <button className="text-[#dcc1ae] text-[11px] font-semibold uppercase hover:underline"
                      onClick={() => unmatch(l.id)}>Unmatch</button>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              No statement lines. Click "Import Statement" to upload your bank's Excel file.
            </td></tr>}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportModal ledgerId={ledgerId} bankName={banks.find(b => b.id === ledgerId)?.name ?? ''}
          onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); loadLines() }} />
      )}
      {createFor && (
        <CreateVoucherModal line={createFor} onClose={() => setCreateFor(null)}
          onDone={() => { setCreateFor(null); loadLines() }} />
      )}
    </div>
  )
}

// =====================================================================
//  IMPORT  (Excel → preview → column mapping → insert)
// =====================================================================
function ImportModal({ ledgerId, bankName, onClose, onDone }: {
  ledgerId: string; bankName: string; onClose: () => void; onDone: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<any[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<Record<string, number>>({})
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  function guessMap(hdrs: string[]) {
    const m: Record<string, number> = {}
    hdrs.forEach((h, i) => {
      const key = String(h ?? '').trim().toLowerCase()
      for (const [field, options] of Object.entries(GUESS)) {
        if (m[field] !== undefined) continue
        if (options.some(o => key === o || key.includes(o))) m[field] = i
      }
    })
    return m
  }

  async function onFile(f: File) {
    setErr(null); setResult(null); setFileName(f.name)
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf, { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, raw: false })

    // find the header row: the first row with 3+ non-empty cells that looks like headers
    let hIdx = 0
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const filled = (rows[i] ?? []).filter(c => String(c ?? '').trim() !== '').length
      const looksLikeHeader = (rows[i] ?? []).some(c =>
        Object.values(GUESS).flat().some(g => String(c ?? '').toLowerCase().includes(g)))
      if (filled >= 3 && looksLikeHeader) { hIdx = i; break }
    }
    const hdrs = (rows[hIdx] ?? []).map((c: any) => String(c ?? '').trim())
    setHeaders(hdrs)
    setRaw(rows.slice(hIdx + 1).filter(r => (r ?? []).some(c => String(c ?? '').trim() !== '')))
    setMap(guessMap(hdrs))
  }

  const parsed = useMemo(() => {
    if (map.date === undefined) return []
    const num = (v: any) => {
      const s = String(v ?? '').replace(/[₹,\s]/g, '').trim()
      if (!s || s === '-') return 0
      const n = Number(s)
      return isFinite(n) ? Math.abs(n) : 0
    }
    const toDate = (v: any): string | null => {
      if (!v) return null
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
      const s = String(v).trim()
      // dd/mm/yyyy or dd-mm-yyyy
      const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
      if (m) {
        const yy = m[3].length === 2 ? '20' + m[3] : m[3]
        return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      }
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }

    return raw.map(r => ({
      txn_date: toDate(r[map.date]),
      description: map.description !== undefined ? String(r[map.description] ?? '').trim() : '',
      reference: map.reference !== undefined ? String(r[map.reference] ?? '').trim() : '',
      withdrawal: map.withdrawal !== undefined ? num(r[map.withdrawal]) : 0,
      deposit: map.deposit !== undefined ? num(r[map.deposit]) : 0,
      balance: map.balance !== undefined ? num(r[map.balance]) : null,
    })).filter(x => x.txn_date && (x.withdrawal > 0 || x.deposit > 0))
  }, [raw, map])

  async function importRows() {
    if (!parsed.length) { setErr('Nothing to import — check the column mapping.'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { data: u } = await supabase.auth.getUser()

    const { data: imp, error: iErr } = await supabase.from('bank_imports').insert({
      org_id: prof?.org_id, ledger_id: ledgerId, file_name: fileName, bank_name: bankName,
      from_date: parsed.reduce((a, b) => a < b.txn_date! ? a : b.txn_date!, parsed[0].txn_date!),
      to_date: parsed.reduce((a, b) => a > b.txn_date! ? a : b.txn_date!, parsed[0].txn_date!),
      closing_balance: parsed[parsed.length - 1]?.balance ?? null,
      row_count: parsed.length, imported_by: u?.user?.id ?? null,
    }).select('id').single()
    if (iErr) { setErr(iErr.message); setBusy(false); return }

    // fingerprint prevents importing the same transaction twice
    const rows = parsed.map(p => ({
      org_id: prof?.org_id, import_id: (imp as any).id, ledger_id: ledgerId,
      txn_date: p.txn_date, description: p.description || null, reference: p.reference || null,
      withdrawal: p.withdrawal, deposit: p.deposit, balance: p.balance,
      fingerprint: `${p.txn_date}|${p.withdrawal}|${p.deposit}|${(p.description || '').slice(0, 40)}|${p.reference || ''}`,
    }))

    let inserted = 0, skipped = 0
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100)
      const { error, count } = await supabase.from('bank_statement_lines')
        .upsert(chunk, { onConflict: 'org_id,ledger_id,fingerprint', ignoreDuplicates: true, count: 'exact' })
      if (error) { setErr(error.message); setBusy(false); return }
      inserted += count ?? 0
      skipped += chunk.length - (count ?? 0)
    }
    setBusy(false)
    setResult({ inserted, skipped })
  }

  const FIELDS: [string, string, boolean][] = [
    ['date', 'Date', true], ['description', 'Description / Narration', false],
    ['reference', 'Reference / Cheque No.', false],
    ['withdrawal', 'Withdrawal (Debit)', false], ['deposit', 'Deposit (Credit)', false],
    ['balance', 'Balance', false],
  ]

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Import Bank Statement</h3>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '40px' }}>check_circle</span>
              <p className="text-[#e2e2e8] font-semibold mt-2">
                Imported {result.inserted} transaction(s)
              </p>
              {result.skipped > 0 && (
                <p className="text-[13px] text-[#dcc1ae] mt-1">
                  {result.skipped} skipped — already imported (duplicate detection).
                </p>
              )}
              <button className="btn btn-primary mt-4" onClick={onDone}>Done</button>
            </div>
          ) : (
            <>
              {!headers.length ? (
                <div className="text-center py-8">
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
                  <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '40px' }}>upload_file</span>
                  <p className="text-[13px] text-[#dcc1ae] mt-2 mb-4">
                    Upload your bank's statement (Excel or CSV).<br />
                    Works with SBI, HDFC, ICICI, Axis, PNB, Canara — or any custom format.
                  </p>
                  <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose File</button>
                </div>
              ) : (
                <>
                  <div className="text-[12px] text-[#dcc1ae] mb-3">
                    <b className="text-[#e2e2e8]">{fileName}</b> · {raw.length} rows found.
                    Check the column mapping below — we guessed it from the headers.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {FIELDS.map(([key, label, required]) => (
                      <label key={key} className="block">
                        <span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">
                          {label}{required && <span className="text-red-400"> *</span>}
                        </span>
                        <select className="input" style={{ fontSize: '12px' }}
                          value={map[key] ?? ''} onChange={e => setMap({ ...map, [key]: e.target.value === '' ? undefined as any : Number(e.target.value) })}>
                          <option value="">— not in file —</option>
                          {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>

                  <div className="rounded-lg border border-white/[0.08] overflow-hidden mb-3">
                    <div className="px-3 py-2 bg-[#282a2e] text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">
                      Preview — {parsed.length} valid transaction(s)
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <table className="w-full text-[12px]">
                        <tbody className="divide-y divide-white/[0.04]">
                          {parsed.slice(0, 8).map((p, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 font-mono text-[#dcc1ae] whitespace-nowrap">{p.txn_date}</td>
                              <td className="px-3 py-1.5 text-[#e2e2e8] max-w-[200px] truncate">{p.description || '—'}</td>
                              <td className="px-3 py-1.5 font-mono text-red-400 text-right">{p.withdrawal ? inr(p.withdrawal) : ''}</td>
                              <td className="px-3 py-1.5 font-mono text-emerald-400 text-right">{p.deposit ? inr(p.deposit) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsed.length > 8 && (
                        <div className="px-3 py-1.5 text-[11px] text-[#dcc1ae]/50">+ {parsed.length - 8} more…</div>
                      )}
                      {!parsed.length && (
                        <div className="px-3 py-4 text-[12px] text-amber-400">
                          No valid rows. Check that Date and at least one of Withdrawal/Deposit are mapped correctly.
                        </div>
                      )}
                    </div>
                  </div>

                  {err && <div className="text-sm text-red-400 mb-2">{err}</div>}
                  <div className="flex gap-2">
                    <button className="btn btn-ghost flex-1" onClick={() => { setHeaders([]); setRaw([]); setMap({}) }}>Choose another file</button>
                    <button className="btn btn-primary flex-[2]" disabled={busy || !parsed.length} onClick={importRows}>
                      {busy ? 'Importing…' : `Import ${parsed.length} transaction(s)`}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#dcc1ae]/50 mt-2">
                    Duplicates are detected automatically — importing the same statement twice is safe.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

// =====================================================================
//  CREATE VOUCHER FROM A STATEMENT LINE
// =====================================================================
function CreateVoucherModal({ line, onClose, onDone }: {
  line: Line; onClose: () => void; onDone: () => void
}) {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [otherLedger, setOtherLedger] = useState('')
  const [narration, setNarration] = useState(line.description ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('acc_ledgers').select('id, name').eq('active', true).order('name')
      setLedgers((data as Ledger[]) ?? [])
    })()
  }, [])

  const isDeposit = Number(line.deposit || 0) > 0
  const amount = Math.max(Number(line.withdrawal || 0), Number(line.deposit || 0))

  async function save() {
    if (!otherLedger) { setErr('Select the ledger to post against.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('bank_create_voucher', {
      p_line: line.id, p_other_ledger: otherLedger, p_narration: narration || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Create Voucher</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          {line.txn_date} · {isDeposit ? 'Money received' : 'Money paid'} · <b className="text-[#e2e2e8]">{inr(amount)}</b>
        </p>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 mb-4 text-[12px]">
          <div className="text-[#dcc1ae]/60 uppercase text-[10px] tracking-wide mb-1">Bank line</div>
          <div className="text-[#e2e2e8]">{line.description || '—'}</div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">
              {isDeposit ? 'Credit which ledger? (where did the money come from)' : 'Debit which ledger? (what was it for)'}
            </span>
            <select className="input" value={otherLedger} onChange={e => setOtherLedger(e.target.value)}>
              <option value="">— Select ledger —</option>
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Narration</span>
            <input className="input" value={narration} onChange={e => setNarration(e.target.value)} />
          </label>
        </div>

        <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
          Creates a balanced <b>Draft</b> voucher and matches it to this statement line.
          Common uses: bank charges, interest, or a payment not yet recorded.
        </p>

        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>
            {busy ? 'Creating…' : 'Create & Match'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[17px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}