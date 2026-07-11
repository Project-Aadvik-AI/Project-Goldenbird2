import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  tallyLedgersXml, tallyVouchersXml, zohoAccountsCsv, zohoJournalsCsv,
  downloadFile, tallyGroup, type ExpLedger, type ExpVoucher,
} from '../lib/tallyExport'

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type LedgerRow = {
  id: string; name: string; group_name: string; opening_balance: number
  party_id: string | null; gstin: string | null; party_type: string | null
}
type VoucherRow = {
  id: string; voucher_no: string; voucher_type: string; voucher_date: string
  narration: string | null; reference_no: string | null; party_name: string | null
  total_debit: number
}
type LineRow = {
  voucher_id: string; ledger_name: string; debit: number; credit: number; remarks: string | null; line_no: number
}

export default function AccountingExport() {
  const { isAdmin } = useAuth()
  const [company, setCompany] = useState('')
  const [ledgers, setLedgers] = useState<LedgerRow[]>([])
  const [vouchers, setVouchers] = useState<VoucherRow[]>([])
  const [lines, setLines] = useState<LineRow[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
      const { data: org } = await supabase.from('organizations').select('name')
        .eq('id', (prof as any)?.org_id).maybeSingle()
      setCompany((org as any)?.name ?? 'My Company')

      // ledgers with their group + party GSTIN
      const { data: lg } = await supabase.from('acc_ledgers')
        .select('id, name, opening_balance, party_id, acc_groups(name), acc_parties(gstin, party_type)')
        .order('name')
      const mapped: LedgerRow[] = ((lg as any[]) ?? []).map(l => ({
        id: l.id, name: l.name,
        group_name: l.acc_groups?.name ?? 'Current Assets',
        opening_balance: Number(l.opening_balance || 0),
        party_id: l.party_id,
        gstin: l.acc_parties?.gstin ?? null,
        party_type: l.acc_parties?.party_type ?? null,
      }))
      setLedgers(mapped)

      // POSTED vouchers in the date range
      const { data: vs } = await supabase.from('acc_vouchers')
        .select('id, voucher_no, voucher_type, voucher_date, narration, reference_no, total_debit, acc_parties(name)')
        .eq('status', 'Posted')
        .gte('voucher_date', from).lte('voucher_date', to)
        .order('voucher_date')
      const vlist: VoucherRow[] = ((vs as any[]) ?? []).map(v => ({
        id: v.id, voucher_no: v.voucher_no, voucher_type: v.voucher_type,
        voucher_date: v.voucher_date, narration: v.narration, reference_no: v.reference_no,
        party_name: v.acc_parties?.name ?? null, total_debit: Number(v.total_debit || 0),
      }))
      setVouchers(vlist)

      if (vlist.length) {
        const { data: ls } = await supabase.from('acc_voucher_lines')
          .select('voucher_id, debit, credit, remarks, line_no, acc_ledgers(name)')
          .in('voucher_id', vlist.map(v => v.id))
          .order('line_no')
        setLines(((ls as any[]) ?? []).map(l => ({
          voucher_id: l.voucher_id, ledger_name: l.acc_ledgers?.name ?? '',
          debit: Number(l.debit || 0), credit: Number(l.credit || 0),
          remarks: l.remarks, line_no: l.line_no,
        })))
      } else setLines([])

      setLoading(false)
    })()
  }, [from, to])

  const expLedgers: ExpLedger[] = useMemo(() => ledgers.map(l => ({
    name: l.name, group_name: l.group_name, opening_balance: l.opening_balance,
    gstin: l.gstin, is_party: !!l.party_id, party_type: l.party_type,
  })), [ledgers])

  const expVouchers: ExpVoucher[] = useMemo(() => vouchers.map(v => ({
    voucher_no: v.voucher_no, voucher_type: v.voucher_type, voucher_date: v.voucher_date,
    narration: v.narration, reference_no: v.reference_no, party_name: v.party_name,
    lines: lines.filter(l => l.voucher_id === v.id)
      .sort((a, b) => a.line_no - b.line_no)
      .map(l => ({ ledger_name: l.ledger_name, debit: l.debit, credit: l.credit, remarks: l.remarks })),
  })).filter(v => v.lines.length >= 2), [vouchers, lines])

  const totalValue = useMemo(() =>
    vouchers.reduce((n, v) => n + Number(v.total_debit || 0), 0), [vouchers])

  const stamp = new Date().toISOString().slice(0, 10)

  function dlTallyLedgers() {
    downloadFile(`tally-ledgers-${stamp}.xml`, tallyLedgersXml(company, expLedgers), 'application/xml')
  }
  function dlTallyVouchers() {
    if (!expVouchers.length) { alert('No posted vouchers in this date range.'); return }
    downloadFile(`tally-vouchers-${stamp}.xml`, tallyVouchersXml(company, expVouchers), 'application/xml')
  }
  function dlZohoAccounts() {
    downloadFile(`zoho-chart-of-accounts-${stamp}.csv`, zohoAccountsCsv(expLedgers), 'text/csv')
  }
  function dlZohoJournals() {
    if (!expVouchers.length) { alert('No posted vouchers in this date range.'); return }
    downloadFile(`zoho-journals-${stamp}.csv`, zohoJournalsCsv(expVouchers), 'text/csv')
  }

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Export is restricted to administrators.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Accounting Export</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Send your books to Tally or Zoho. Only <b>posted</b> vouchers are exported.
        </p>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="Company (as named in Tally)">
          <input className="input" value={company} onChange={e => setCompany(e.target.value)} style={{ minWidth: 220 }} />
        </L>
        <L label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></L>
        <L label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></L>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <K label="Ledgers" value={String(ledgers.length)} />
            <K label="Posted Vouchers" value={String(expVouchers.length)} />
            <K label="Total Value" value={inr(totalValue)} />
          </div>

          {/* TALLY */}
          <div className="card p-5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>swap_horiz</span>
              <h3 className="text-sm font-semibold text-[#e2e2e8]">Tally Prime — XML</h3>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mb-4">
              Import the <b>ledgers first</b>, then the vouchers. Our chart of accounts already uses
              Tally's group names, so it imports without mapping errors.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Step n={1} title="Ledger Masters" desc={`${ledgers.length} ledgers, with Tally groups + party GSTINs`}
                onClick={dlTallyLedgers} label="Download XML" />
              <Step n={2} title="Vouchers" desc={`${expVouchers.length} posted vouchers · ${inr(totalValue)}`}
                onClick={dlTallyVouchers} label="Download XML" disabled={!expVouchers.length} />
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">How to import into Tally</div>
              <ol className="text-[12px] text-[#dcc1ae] space-y-1 list-decimal list-inside">
                <li>Open your company in Tally Prime</li>
                <li>Gateway of Tally → <b>Import</b> → <b>Masters</b> → choose <code className="text-[#ffb87b]">tally-ledgers.xml</code></li>
                <li>Then Gateway of Tally → <b>Import</b> → <b>Vouchers</b> → choose <code className="text-[#ffb87b]">tally-vouchers.xml</code></li>
                <li>Check the import log for any skipped entries</li>
              </ol>
            </div>
          </div>

          {/* ZOHO */}
          <div className="card p-5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>cloud_upload</span>
              <h3 className="text-sm font-semibold text-[#e2e2e8]">Zoho Books — CSV</h3>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mb-4">
              Chart of accounts first, then journals. Groups are mapped to Zoho account types
              (Sundry Debtors → Accounts Receivable, Direct Expenses → Cost of Goods Sold, and so on).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Step n={1} title="Chart of Accounts" desc={`${ledgers.length} accounts with Zoho types`}
                onClick={dlZohoAccounts} label="Download CSV" />
              <Step n={2} title="Journals" desc={`${expVouchers.length} vouchers as journal entries`}
                onClick={dlZohoJournals} label="Download CSV" disabled={!expVouchers.length} />
            </div>
          </div>

          {/* group mapping reference */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <span className="text-sm font-semibold text-[#e2e2e8]">Group Mapping (for reference)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Our Group', 'Tally Group', 'Ledgers'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {[...new Set(ledgers.map(l => l.group_name))].sort().map(g => {
                  const t = tallyGroup(g)
                  const count = ledgers.filter(l => l.group_name === g).length
                  return (
                    <tr key={g} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-[#e2e2e8]">{g}</td>
                      <td className="px-4 py-2">
                        <span className={t === g ? 'text-[#dcc1ae]' : 'text-[#ffb87b]'}>{t}</span>
                        {t !== g && <span className="ml-2 text-[10px] text-[#dcc1ae]/50">(renamed for Tally)</span>}
                      </td>
                      <td className="px-4 py-2 font-mono text-[#dcc1ae]">{count}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Step({ n, title, desc, onClick, label, disabled }: {
  n: number; title: string; desc: string; onClick: () => void; label: string; disabled?: boolean
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-5 w-5 rounded-full bg-[#ff8f00]/15 text-[#ffb87b] text-[11px] font-bold flex items-center justify-center">{n}</span>
        <span className="text-[13px] font-semibold text-[#e2e2e8]">{title}</span>
      </div>
      <p className="text-[11px] text-[#dcc1ae]/70 mb-3">{desc}</p>
      <button className="btn btn-primary w-full" style={{ padding: '6px 12px', fontSize: '12px' }}
        disabled={disabled} onClick={onClick}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span> {label}
      </button>
    </div>
  )
}
function K({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-[20px] font-bold text-[#e2e2e8]">{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}