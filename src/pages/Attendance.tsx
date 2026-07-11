import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'

type Employee = { id: string; full_name: string; emp_code: string | null; department: string | null; status: string }
type Att = { id: string; employee_id: string; date: string; status: string; hours: number | null; remark: string | null }

const STATUSES = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Week Off'] as const
type Status = typeof STATUSES[number]

const STATUS_STYLES: Record<string, string> = {
  Present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  'Half Day': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Leave: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  Holiday: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Week Off': 'bg-white/5 text-[#dcc1ae] border-white/10',
}

export default function Attendance() {
  const [tab, setTab] = useState<'day' | 'month'>('day')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [dayRows, setDayRows] = useState<Att[]>([])
  const { activeProject } = useProject()
  const [monthRows, setMonthRows] = useState<Att[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  async function loadEmployees() {
    // Only employees assigned to the ACTIVE project should appear here.
    // Link: user_projects (profile_id ↔ project) → employees.profile_id
    if (!activeProject) { setEmployees([]); return }

    const { data: up } = await supabase.from('user_projects')
      .select('user_id').eq('project_id', activeProject.id)
    const profileIds = ((up as { user_id: string }[]) ?? []).map(x => x.user_id)

    if (!profileIds.length) { setEmployees([]); return }

    const { data } = await supabase.from('employees')
      .select('id, full_name, emp_code, department, status')
      .in('profile_id', profileIds)
      .eq('status', 'Active').order('full_name')
    setEmployees((data as Employee[]) ?? [])
  }

  async function loadDay() {
    setLoading(true)
    const { data } = await supabase.from('attendance').select('*').eq('date', date)
    setDayRows((data as Att[]) ?? [])
    setLoading(false)
  }

  async function loadMonth() {
    setLoading(true)
    const from = `${month}-01`
    const y = Number(month.slice(0, 4)); const m = Number(month.slice(5, 7))
    const lastDay = new Date(y, m, 0).getDate()
    const to = `${month}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabase.from('attendance').select('*').gte('date', from).lte('date', to)
    setMonthRows((data as Att[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadEmployees() }, [activeProject?.id])
  useEffect(() => { if (tab === 'day') loadDay() }, [date, tab])
  useEffect(() => { if (tab === 'month') loadMonth() }, [month, tab])

  async function mark(empId: string, status: Status) {
    setSaving(empId)
    const existing = dayRows.find(r => r.employee_id === empId)
    if (existing) {
      await supabase.from('attendance').update({ status }).eq('id', existing.id)
    } else {
      const { data: prof } = await supabase.from('profiles').select('org_id').single()
      await supabase.from('attendance').insert({
        org_id: prof?.org_id, employee_id: empId, date, status,
      })
    }
    await loadDay()
    setSaving(null)
  }

  async function markAll(status: Status) {
    if (!confirm(`Mark ALL employees as ${status} for ${date}?`)) return
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    for (const emp of employees) {
      const existing = dayRows.find(r => r.employee_id === emp.id)
      if (existing) {
        await supabase.from('attendance').update({ status }).eq('id', existing.id)
      } else {
        await supabase.from('attendance').insert({ org_id: prof?.org_id, employee_id: emp.id, date, status })
      }
    }
    await loadDay()
  }

  const dayMap = useMemo(() => {
    const m = new Map<string, Att>()
    for (const r of dayRows) m.set(r.employee_id, r)
    return m
  }, [dayRows])

  const monthDays = useMemo(() => {
    const y = Number(month.slice(0, 4)); const m = Number(month.slice(5, 7))
    const lastDay = new Date(y, m, 0).getDate()
    return Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  }, [month])

  const monthMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of monthRows) m.set(`${r.employee_id}|${r.date}`, r.status)
    return m
  }, [monthRows])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Attendance</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Mark daily attendance and review the month</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tab === 'day' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setTab('day')}>Day</button>
            <button className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tab === 'month' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setTab('month')}>Month</button>
          </div>
          {tab === 'day'
            ? <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minWidth: 150 }} />
            : <input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ minWidth: 150 }} />}
        </div>
      </div>

      {tab === 'day' && (
        <>
          <div className="mb-3 flex gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider self-center mr-2">Bulk mark:</span>
            {STATUSES.map(s => (
              <button key={s} className={`px-3 py-1 rounded border text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLES[s]}`} onClick={() => markAll(s)}>{s}</button>
            ))}
          </div>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">Employee</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">Dept</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">Mark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {employees.map(emp => {
                  const cur = dayMap.get(emp.id)?.status
                  return (
                    <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-[#e2e2e8]">
                        <div className="font-semibold">{emp.full_name}</div>
                        {emp.emp_code && <div className="text-[10px] font-mono uppercase text-[#dcc1ae]/60">{emp.emp_code}</div>}
                      </td>
                      <td className="px-4 py-3 text-[#dcc1ae]">{emp.department || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {STATUSES.map(s => (
                            <button key={s}
                              disabled={saving === emp.id}
                              onClick={() => mark(emp.id, s)}
                              className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-opacity ${cur === s ? STATUS_STYLES[s] + ' opacity-100' : 'bg-white/[0.02] text-[#dcc1ae]/60 border-white/10 hover:opacity-100 opacity-70'}`}>
                              {s === 'Half Day' ? 'Half' : s === 'Week Off' ? 'WO' : s.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!employees.length && !loading && (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                    {!activeProject
                      ? 'Select a project first (use the project switcher at the top).'
                      : <>No employees are assigned to <b className="text-[#e2e2e8]">{activeProject.name}</b>.<br />
                          <span className="text-[12px]">Assign them in Head Office → Projects → Edit → Assign Employees.</span></>}
                  </td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
          </div>
        </>
      )}

      {tab === 'month' && (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#282a2e]">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap sticky left-0 bg-[#282a2e]">Employee</th>
                {monthDays.map(d => (
                  <th key={d} className="px-1 py-2 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{d.slice(-2)}</th>
                ))}
                <th className="px-3 py-2 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">P</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">A</th>
                <th className="px-3 py-2 text-center text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {employees.map(emp => {
                let p = 0, a = 0, l = 0
                for (const day of monthDays) {
                  const s = monthMap.get(`${emp.id}|${day}`)
                  if (s === 'Present') p++
                  else if (s === 'Half Day') { p += 0.5; a += 0.5 }
                  else if (s === 'Absent') a++
                  else if (s === 'Leave') l++
                }
                return (
                  <tr key={emp.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[#e2e2e8] font-semibold whitespace-nowrap sticky left-0 bg-[#1B1F2A]">{emp.full_name}</td>
                    {monthDays.map(day => {
                      const s = monthMap.get(`${emp.id}|${day}`)
                      const letter = s === 'Present' ? 'P' : s === 'Absent' ? 'A' : s === 'Half Day' ? 'H' : s === 'Leave' ? 'L' : s === 'Holiday' ? 'HO' : s === 'Week Off' ? 'W' : '·'
                      const cls = s ? STATUS_STYLES[s] : 'text-[#dcc1ae]/30'
                      return (
                        <td key={day} className="px-1 py-2 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold ${s ? cls.replace('border-', 'border ') : ''}`}>{letter}</span>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center font-mono text-emerald-400 font-bold">{p}</td>
                    <td className="px-3 py-2 text-center font-mono text-red-400 font-bold">{a}</td>
                    <td className="px-3 py-2 text-center font-mono text-sky-400 font-bold">{l}</td>
                  </tr>
                )
              })}
              {!employees.length && !loading && (
                <tr><td colSpan={monthDays.length + 4} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">Add employees first.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>
      )}
    </div>
  )
}