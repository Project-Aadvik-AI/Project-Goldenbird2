import jsPDF from 'jspdf'

const inr = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type PayslipData = {
  payslip_no: string
  month_label: string
  employee_name: string
  emp_code: string | null
  designation: string | null
  department: string | null
  project_name: string | null
  uan_no?: string | null
  pan_no?: string | null

  days_in_month: number
  days_present: number; days_half: number; days_leave: number
  days_holiday: number; days_weekoff: number; days_absent: number
  paid_days: number; lop_days: number

  basic: number; hra: number; conveyance: number
  medical: number; special: number; other_allow: number
  gross_salary: number; earned_gross: number; lop_amount: number
  overtime_hours: number; overtime_amt: number
  bonus: number; incentive: number
  total_earnings: number

  pf_employee: number; esi_employee: number
  pt_amount: number; tds_amount: number
  loan_deduct: number; advance_deduct: number; other_deduct: number
  total_deductions: number

  net_salary: number
  pay_mode: string
  bank_name: string | null
  bank_account: string | null
}

/** Words for the amount — every Indian payslip carries this. */
function amountInWords(n: number): string {
  const num = Math.round(Math.abs(n))
  if (num === 0) return 'Zero Rupees Only'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const two = (x: number): string => {
    if (x < 20) return ones[x]
    return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')
  }
  const three = (x: number): string => {
    const h = Math.floor(x / 100)
    const r = x % 100
    return (h ? ones[h] + ' Hundred' + (r ? ' and ' : '') : '') + (r ? two(r) : '')
  }

  // the Indian system: crore, lakh, thousand
  const crore = Math.floor(num / 10000000)
  const lakh = Math.floor((num % 10000000) / 100000)
  const thousand = Math.floor((num % 100000) / 1000)
  const rest = num % 1000

  let s = ''
  if (crore) s += three(crore) + ' Crore '
  if (lakh) s += three(lakh) + ' Lakh '
  if (thousand) s += three(thousand) + ' Thousand '
  if (rest) s += three(rest)

  return s.trim() + ' Rupees Only'
}

export function generatePayslipPdf(p: PayslipData, companyName = 'AADVIK BUILDCON') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 15          // margin
  const CW = W - M * 2  // content width
  let y = 0

  // ---------- header ----------
  doc.setFillColor(26, 26, 23)
  doc.rect(0, 0, W, 26, 'F')

  doc.setTextColor(255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(companyName, M, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200)
  doc.text('Payslip for ' + p.month_label, M, 19)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255)
  doc.text(p.payslip_no, W - M, 19, { align: 'right' })

  y = 34

  // ---------- employee ----------
  doc.setTextColor(0)
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)

  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0)
    doc.text(value || '-', x, yy + 4.5, { maxWidth: w })
  }

  const col = CW / 3
  field('Employee', p.employee_name, M, y, col - 4)
  field('Employee Code', p.emp_code ?? '-', M + col, y, col - 4)
  field('Department', p.department ?? '-', M + col * 2, y, col - 4)
  y += 12
  field('Designation', p.designation ?? '-', M, y, col - 4)
  field('Project', p.project_name ?? '-', M + col, y, col - 4)
  field('UAN / PAN', [p.uan_no, p.pan_no].filter(Boolean).join(' / ') || '-', M + col * 2, y, col - 4)
  y += 12

  doc.line(M, y, W - M, y)
  y += 6

  // ---------- attendance ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(80)
  doc.text('ATTENDANCE', M, y)
  y += 5

  const att: [string, number][] = [
    ['Days in Month', p.days_in_month],
    ['Present', p.days_present],
    ['Half Day', p.days_half],
    ['Holiday', p.days_holiday],
    ['Week Off', p.days_weekoff],
    ['Leave', p.days_leave],
    ['Absent', p.days_absent],
    ['Paid Days', p.paid_days],
  ]
  const aw = CW / att.length
  att.forEach(([k, v], i) => {
    const x = M + aw * i
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(120)
    doc.text(k.toUpperCase(), x, y, { maxWidth: aw - 2 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(k === 'Paid Days' ? 200 : 0, k === 'Paid Days' ? 100 : 0, 0)
    doc.text(String(v), x, y + 5)
  })
  doc.setTextColor(0)
  y += 11

  if (Number(p.lop_days) > 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(180, 40, 40)
    doc.text(
      `${p.lop_days} day(s) loss of pay — leave and absence are not paid.`,
      M, y
    )
    doc.setTextColor(0)
    y += 5
  }

  doc.line(M, y, W - M, y)
  y += 7

  // ---------- earnings / deductions, side by side ----------
  const half = CW / 2 - 3
  const leftX = M
  const rightX = M + half + 6
  const startY = y

  const table = (x: number, title: string, rows: [string, number][], total: number, accent: number[]) => {
    let yy = startY

    doc.setFillColor(accent[0], accent[1], accent[2])
    doc.rect(x, yy, half, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255)
    doc.text(title.toUpperCase(), x + 3, yy + 4.8)
    yy += 7

    doc.setTextColor(0)
    rows.forEach(([k, v], i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 248)
        doc.rect(x, yy, half, 6, 'F')
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(k, x + 3, yy + 4.2, { maxWidth: half - 32 })
      doc.setFont('helvetica', 'normal')
      doc.text(inr(v), x + half - 3, yy + 4.2, { align: 'right' })
      yy += 6
    })

    doc.setDrawColor(180)
    doc.line(x, yy, x + half, yy)
    yy += 1
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Total', x + 3, yy + 4.5)
    doc.text(inr(total), x + half - 3, yy + 4.5, { align: 'right' })
    yy += 8

    return yy
  }

  const earnRows: [string, number][] = ([
    ['Basic', p.basic],
    ['HRA', p.hra],
    ['Conveyance', p.conveyance],
    ['Medical', p.medical],
    ['Special Allowance', p.special],
    ['Other Allowance', p.other_allow],
  ] as [string, number][]).filter(([, v]) => Number(v) > 0)

  // show the pro-rata clearly — this is the number people query
  const earnDisplay: [string, number][] = [
    ...earnRows,
    ['— Gross (full month)', p.gross_salary],
    [`Earned (${p.paid_days}/${p.days_in_month} days)`, p.earned_gross],
  ]
  if (Number(p.lop_amount) > 0) earnDisplay.push([`Loss of Pay (${p.lop_days}d)`, -p.lop_amount])
  if (Number(p.overtime_amt) > 0) earnDisplay.push([`Overtime (${p.overtime_hours}h)`, p.overtime_amt])
  if (Number(p.bonus) > 0) earnDisplay.push(['Bonus', p.bonus])
  if (Number(p.incentive) > 0) earnDisplay.push(['Incentive', p.incentive])

  const dedRows: [string, number][] = ([
    ['Provident Fund', p.pf_employee],
    ['ESI', p.esi_employee],
    ['Professional Tax', p.pt_amount],
    ['Income Tax (TDS)', p.tds_amount],
    ['Loan Repayment', p.loan_deduct],
    ['Advance Recovery', p.advance_deduct],
    ['Other Deductions', p.other_deduct],
  ] as [string, number][]).filter(([, v]) => Number(v) > 0)

  const yL = table(leftX, 'Earnings', earnDisplay, p.total_earnings, [22, 101, 52])
  const yR = table(rightX, 'Deductions', dedRows.length ? dedRows : [['None', 0]],
                   p.total_deductions, [146, 64, 14])

  y = Math.max(yL, yR) + 4

  // ---------- net ----------
  doc.setFillColor(255, 143, 0)
  doc.rect(M, y, CW, 13, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255)
  doc.text('NET SALARY', M + 4, y + 8.5)
  doc.setFontSize(15)
  doc.text('Rs ' + inr(p.net_salary), W - M - 4, y + 9, { align: 'right' })
  y += 17

  doc.setTextColor(60)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.text(amountInWords(p.net_salary), M, y, { maxWidth: CW })
  y += 8

  // ---------- payment ----------
  doc.setTextColor(0)
  doc.setDrawColor(210)
  doc.line(M, y, W - M, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100)
  const bank = p.bank_account
    ? `${p.bank_name ?? ''} ****${String(p.bank_account).slice(-4)}`
    : '-'
  doc.text(`Payment mode: ${p.pay_mode}    Bank: ${bank}`, M, y)
  y += 12

  // ---------- footer ----------
  doc.setFontSize(7.5)
  doc.setTextColor(140)
  doc.text(
    'This is a computer-generated payslip and does not require a signature.',
    M, 280
  )
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')}`,
    W - M, 280, { align: 'right' }
  )

  const safe = p.employee_name.replace(/[^a-z0-9]/gi, '_')
  doc.save(`Payslip_${safe}_${p.month_label.replace(' ', '_')}.pdf`)
}