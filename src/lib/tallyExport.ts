// =====================================================================
//  Tally & Zoho Books export
//  Our chart of accounts was designed with Tally group names, so the
//  mapping is mostly 1:1 — which is exactly why imports don't error.
// =====================================================================

// Our group name → Tally's exact built-in group name.
// Anything not listed passes through unchanged (it already matches Tally).
const TALLY_GROUP: Record<string, string> = {
  'Sundry Debtors': 'Sundry Debtors',
  'Sundry Creditors': 'Sundry Creditors',
  'Bank Accounts': 'Bank Accounts',
  'Cash in Hand': 'Cash-in-Hand',            // Tally spells it with hyphens
  'Duties & Taxes': 'Duties & Taxes',
  'Current Assets': 'Current Assets',
  'Current Liabilities': 'Current Liabilities',
  'Fixed Assets': 'Fixed Assets',
  'Direct Income': 'Direct Incomes',          // Tally uses the plural
  'Indirect Income': 'Indirect Incomes',
  'Direct Expenses': 'Direct Expenses',
  'Indirect Expenses': 'Indirect Expenses',
  'Capital Account': 'Capital Account',
  'Provisions': 'Provisions',
  'Loans & Advances (Asset)': 'Loans & Advances (Asset)',
}

// Our voucher type → Tally's built-in voucher type name
const TALLY_VOUCHER: Record<string, string> = {
  'Sales': 'Sales',
  'Purchase': 'Purchase',
  'Payment': 'Payment',
  'Receipt': 'Receipt',
  'Journal': 'Journal',
  'Contra': 'Contra',
  'Debit Note': 'Debit Note',
  'Credit Note': 'Credit Note',
}

export const tallyGroup = (g: string) => TALLY_GROUP[g] ?? g
export const tallyVoucherType = (v: string) => TALLY_VOUCHER[v] ?? 'Journal'

// Tally wants dates as YYYYMMDD
export const tallyDate = (iso: string) => (iso || '').replace(/-/g, '')

// XML-escape — a stray & or < will break the whole import
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export type ExpLedger = {
  name: string
  group_name: string
  opening_balance: number   // +Dr / -Cr
  gstin?: string | null
  is_party?: boolean
  party_type?: string | null
}

export type ExpLine = {
  ledger_name: string
  debit: number
  credit: number
  remarks?: string | null
}

export type ExpVoucher = {
  voucher_no: string
  voucher_type: string
  voucher_date: string       // yyyy-mm-dd
  narration?: string | null
  reference_no?: string | null
  party_name?: string | null
  lines: ExpLine[]
}

// ---------------------------------------------------------------
//  1) LEDGER MASTERS  → import these into Tally FIRST
// ---------------------------------------------------------------
export function tallyLedgersXml(companyName: string, ledgers: ExpLedger[]): string {
  const body = ledgers.map(l => {
    // Tally opening balance: Debit is positive, Credit is negative
    const ob = Number(l.opening_balance || 0)
    return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <LEDGER NAME="${esc(l.name)}" ACTION="Create">
          <NAME>${esc(l.name)}</NAME>
          <PARENT>${esc(tallyGroup(l.group_name))}</PARENT>
          <OPENINGBALANCE>${ob.toFixed(2)}</OPENINGBALANCE>
          <ISBILLWISEON>${l.is_party ? 'Yes' : 'No'}</ISBILLWISEON>
          ${l.gstin ? `<PARTYGSTIN>${esc(l.gstin)}</PARTYGSTIN>` : ''}
          <AFFECTSSTOCK>No</AFFECTSSTOCK>
        </LEDGER>
      </TALLYMESSAGE>`
  }).join('\n')

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${body}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

// ---------------------------------------------------------------
//  2) VOUCHERS
//  Tally convention: AMOUNT is negative for debit, positive for credit
//  (yes, it is the reverse of what you would expect) and
//  ISDEEMEDPOSITIVE = Yes marks the debit side.
// ---------------------------------------------------------------
export function tallyVouchersXml(companyName: string, vouchers: ExpVoucher[]): string {
  const body = vouchers.map(v => {
    const entries = v.lines.map(l => {
      const isDebit = Number(l.debit || 0) > 0
      const amount = isDebit ? -Math.abs(Number(l.debit)) : Math.abs(Number(l.credit))
      return `          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${esc(l.ledger_name)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${amount.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`
    }).join('\n')

    const d = tallyDate(v.voucher_date)
    const vt = tallyVoucherType(v.voucher_type)

    return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${esc(vt)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
          <DATE>${d}</DATE>
          <EFFECTIVEDATE>${d}</EFFECTIVEDATE>
          <VOUCHERTYPENAME>${esc(vt)}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(v.voucher_no)}</VOUCHERNUMBER>
          ${v.party_name ? `<PARTYLEDGERNAME>${esc(v.party_name)}</PARTYLEDGERNAME>` : ''}
          ${v.reference_no ? `<REFERENCE>${esc(v.reference_no)}</REFERENCE>` : ''}
          <NARRATION>${esc(v.narration ?? '')}</NARRATION>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
${entries}
        </VOUCHER>
      </TALLYMESSAGE>`
  }).join('\n')

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${body}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

// ---------------------------------------------------------------
//  3) ZOHO BOOKS — CSV
// ---------------------------------------------------------------
function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}

// Zoho Chart of Accounts import format
export function zohoAccountsCsv(ledgers: ExpLedger[]): string {
  const ZOHO_TYPE: Record<string, string> = {
    'Sundry Debtors': 'Accounts Receivable',
    'Sundry Creditors': 'Accounts Payable',
    'Bank Accounts': 'Bank',
    'Cash in Hand': 'Cash',
    'Duties & Taxes': 'Other Current Liability',
    'Current Assets': 'Other Current Asset',
    'Current Liabilities': 'Other Current Liability',
    'Fixed Assets': 'Fixed Asset',
    'Direct Income': 'Income',
    'Indirect Income': 'Other Income',
    'Direct Expenses': 'Cost of Goods Sold',
    'Indirect Expenses': 'Expense',
    'Capital Account': 'Equity',
  }
  const head = ['Account Name', 'Account Type', 'Account Code', 'Description', 'Opening Balance']
  const rows = ledgers.map(l => [
    l.name,
    ZOHO_TYPE[l.group_name] ?? 'Expense',
    '',
    l.group_name,
    Number(l.opening_balance || 0).toFixed(2),
  ])
  return csv([head, ...rows])
}

// Zoho journal import — one row per voucher line
export function zohoJournalsCsv(vouchers: ExpVoucher[]): string {
  const head = [
    'Journal Date', 'Journal Number', 'Reference Number', 'Notes',
    'Account', 'Description', 'Debit', 'Credit',
  ]
  const rows: (string | number)[][] = []
  for (const v of vouchers) {
    for (const l of v.lines) {
      rows.push([
        v.voucher_date,
        v.voucher_no,
        v.reference_no ?? '',
        v.narration ?? '',
        l.ledger_name,
        l.remarks ?? '',
        Number(l.debit || 0) ? Number(l.debit).toFixed(2) : '',
        Number(l.credit || 0) ? Number(l.credit).toFixed(2) : '',
      ])
    }
  }
  return csv([head, ...rows])
}

// ---------------------------------------------------------------
//  download helper
// ---------------------------------------------------------------
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}