import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Reusable table exporters. Pass headers + a matrix of rows.
// (Amounts should be plain numbers with headers like "Amount (INR)"
//  — the ₹ glyph doesn't render in the default PDF font.)

type Cell = string | number
type Matrix = Cell[][]

export function exportExcel(filename: string, headers: string[], rows: Matrix) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportPDF(title: string, headers: string[], rows: Matrix) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`AADVIK · ${new Date().toLocaleString('en-IN')}`, 14, 22)
  autoTable(doc, {
    head: [headers],
    body: rows.map(r => r.map(c => (c === null || c === undefined ? '' : String(c)))),
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [26, 26, 23], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 244, 240] },
  })
  doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
}