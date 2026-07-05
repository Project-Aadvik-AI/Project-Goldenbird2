import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, type Module } from '../lib/auth'
import { useProject } from '../lib/project'
import { useEffect, useRef, useState } from 'react'

// ============================================================
// AppShell — architectural-minimal frame matched to the landing.
// Near-black, hairlines, mono labels, quiet off-white active
// state with a thin orange bar. Nav / switcher / admin / mobile
// all preserved.
// ============================================================

type NavItem = { to: string; label: string; icon: string; module?: Module; adminOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/project', label: 'Project Home', icon: 'space_dashboard' },
  { to: '/expenses', label: 'Daily Expenses', icon: 'payments', module: 'expenses' },
  { to: '/store', label: 'Store IN / OUT', icon: 'inventory_2', module: 'store' },
  { to: '/machines', label: 'Machine Status', icon: 'precision_manufacturing', module: 'machines' },
  { to: '/dpr', label: 'Daily Progress', icon: 'pending_actions', module: 'dpr' },
  { to: '/labour', label: 'Labour & Wages', icon: 'groups', module: 'labour' },
  { to: '/purchase', label: 'Purchase Requests', icon: 'shopping_cart', module: 'purchase_requests' },
  { to: '/work-orders', label: 'Work Orders', icon: 'receipt_long', module: 'work_orders' },
  { to: '/drawings', label: 'Drawings', icon: 'design_services', module: 'drawings' },
  { to: '/tasks', label: 'Tasks', icon: 'task_alt' },
  { to: '/vendor-bills', label: 'Vendor Bills', icon: 'request_quote', module: 'vendor_bills' },
  { to: '/reports', label: 'Reports', icon: 'analytics', module: 'reports' },
  { to: '/ai-brief', label: 'AI Site Brief', icon: 'psychology', module: 'reports' },
  { to: '/employees', label: 'Employees', icon: 'badge', module: 'hr' },
  { to: '/attendance', label: 'Attendance', icon: 'event_available', module: 'hr' },
  { to: '/leaves', label: 'Leave & Holidays', icon: 'beach_access', module: 'hr' },
  { to: '/documents', label: 'Documents', icon: 'folder_open', module: 'documents' },
  { to: '/correspondence', label: 'Correspondence', icon: 'mail', module: 'correspondence' },
  { to: '/contracts', label: 'Contracts', icon: 'gavel', module: 'contracts' },
  { to: '/masters', label: 'Master Data', icon: 'database', module: 'masters' },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/staff', label: 'Staff & Permissions', icon: 'admin_panel_settings' },
  { to: '/projects', label: 'Projects', icon: 'domain' },
  { to: '/admin/reports', label: 'Reports & Export', icon: 'download' },
  { to: '/admin/invite', label: 'Invite Code', icon: 'qr_code_2' },
  { to: '/team', label: 'Team', icon: 'group_add' },
]

const BOTTOM_NAV = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/projects', label: 'Projects', icon: 'domain' },
  { to: '/expenses', label: 'Expenses', icon: 'payments' },
  { to: '/store', label: 'Store', icon: 'inventory_2' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 py-2.5 pr-4 text-[11px] font-medium tracking-[0.12em] uppercase transition-colors duration-150 ${
    isActive
      ? 'text-[#ECEBE6] border-l-2 border-[#ff8f00] pl-[14px]'
      : 'text-[#7C7C76] hover:text-[#ECEBE6] pl-4 border-l-2 border-transparent'
  }`

export default function AppShell() {
  const { profile, user, signOut, isAdmin, can } = useAuth()
  const [open, setOpen] = useState(false)

  const visibleNav = NAV.filter(n => {
    if (n.adminOnly) return isAdmin
    if (n.module) return can(n.module, 'view')
    return true
  })
  const visibleAdmin = isAdmin ? ADMIN_NAV : []
  const initials = (profile?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div className="h-full flex bg-[#0B0B0C] text-[#ECEBE6]">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-30 inset-y-0 left-0 w-[236px] bg-[#0B0B0C] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 h-[72px] flex items-center gap-3 border-b border-white/[0.06] flex-shrink-0">
          <span className="w-[7px] h-[7px] bg-[#ff8f00] rounded-[1px] mt-[1px] flex-shrink-0" />
          <div>
            <div className="text-[13px] font-semibold tracking-[0.24em] text-[#ECEBE6] leading-none">AADVIK</div>
            <div className="text-[9px] text-[#66665F] uppercase tracking-[0.24em] mt-1">Construction OS</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {visibleNav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={linkClass}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          {visibleAdmin.length > 0 && (
            <>
              <div className="mt-5 px-4 pt-4 pb-2 text-[9px] font-semibold text-[#66665F] uppercase tracking-[0.24em] border-t border-white/[0.06] flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[#ff8f00]" /> Admin
              </div>
              {visibleAdmin.map(n => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={linkClass}>
                  <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>{n.icon}</span>
                  {n.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#ECEBE6] text-[11px] font-semibold flex-shrink-0">{initials}</div>
            <div className="overflow-hidden">
              <div className="text-[12px] font-medium text-[#ECEBE6] truncate">{profile?.full_name || user?.email}</div>
              <div className="text-[10px] text-[#66665F] capitalize tracking-wide">{profile?.role || 'member'}</div>
            </div>
          </div>
          <button onClick={signOut} className="btn btn-ghost w-full" style={{ fontSize: '11px', padding: '9px 12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[72px] border-b border-white/[0.06] flex items-center gap-3 px-4 lg:px-6 bg-[#0B0B0C] sticky top-0 z-10 flex-shrink-0">
          <button className="lg:hidden btn btn-ghost" style={{ padding: '8px', minWidth: 0 }} onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <ProjectSwitcher />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 flex-shrink-0"></span>
            <span className="hidden sm:block text-[10px] font-mono tracking-[0.24em] text-[#66665F] uppercase">Live</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
          <Outlet />
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex justify-around items-center h-16 bg-[#0B0B0C] border-t border-white/[0.08]">
          {BOTTOM_NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors ${isActive ? 'text-[#ECEBE6]' : 'text-[#66665F]'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{n.icon}</span>
              <span className="text-[10px] font-medium tracking-wide">{n.label}</span>
            </NavLink>
          ))}
          <button className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[#66665F]" onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>menu</span>
            <span className="text-[10px] font-medium tracking-wide">More</span>
          </button>
        </nav>
      </div>
    </div>
  )
}

function ProjectSwitcher() {
  const { projects, activeProject, setActiveProject, loading } = useProject()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (loading) {
    return <div className="text-[11px] text-[#66665F] font-mono tracking-wide">Loading projects…</div>
  }

  if (!projects.length) {
    return (
      <a href="/projects" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/[0.14] text-[#9C9C96] text-[11px] font-medium hover:border-[#ff8f00]/40 hover:text-[#ECEBE6] transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
        Create first project
      </a>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/[0.08] hover:border-white/[0.16] transition-colors max-w-[240px] sm:max-w-none"
      >
        <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-[#66665F] hidden sm:inline">Project</span>
        <div className="text-left overflow-hidden">
          <div className="text-[12px] font-medium text-[#ECEBE6] truncate">{activeProject?.name ?? 'Pick a project'}</div>
          {activeProject?.code && <div className="text-[9px] text-[#66665F] font-mono uppercase tracking-[0.16em]">{activeProject.code}</div>}
        </div>
        <span className="material-symbols-outlined text-[#66665F] flex-shrink-0" style={{ fontSize: '16px' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] bg-[#131316] border border-white/[0.08] rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] overflow-hidden z-30">
          <div className="px-4 py-3 border-b border-white/[0.06] text-[10px] font-mono text-[#66665F] uppercase tracking-[0.2em]">
            Switch project
          </div>
          <div className="max-h-80 overflow-y-auto">
            {projects.map(p => {
              const isActive = activeProject?.id === p.id
              return (
                <button key={p.id}
                  onClick={() => { setActiveProject(p); setOpen(false) }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}
                >
                  <span className={`material-symbols-outlined flex-shrink-0 ${isActive ? 'text-[#ff8f00]' : 'text-[#66665F]'}`}
                    style={{ fontSize: '18px', fontVariationSettings: isActive ? "'FILL' 1" : undefined }}>
                    {isActive ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#ECEBE6] truncate">{p.name}</div>
                    <div className="text-[10px] text-[#66665F] truncate">
                      {p.code ? <span className="font-mono uppercase tracking-wide">{p.code}</span> : null}
                      {p.code && p.client ? ' · ' : ''}
                      {p.client}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="border-t border-white/[0.06]">
            <a href="/projects" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-[11px] font-medium text-[#9C9C96] hover:text-[#ECEBE6] hover:bg-white/[0.03] uppercase tracking-[0.14em] transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              New project
            </a>
          </div>
        </div>
      )}
    </div>
  )
}