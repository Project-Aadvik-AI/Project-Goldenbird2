import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import ChangePassword from '../pages/ChangePassword'
import NotificationBell from './NotificationBell'
import { useAuth, type Module } from '../lib/auth'
import { useProject } from '../lib/project'
import { useWorkspace } from '../lib/workspace'
import { ThemeToggle } from '../lib/theme'
import { useLang, LanguageToggle } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'

type Leaf = { to: string; label: string; icon: string; module?: Module; adminOnly?: boolean }
type Group = { group: string; icon: string; items: Leaf[] }
type Entry = Leaf | Group
const isGroup = (e: Entry): e is Group => 'group' in e

const NAV: Entry[] = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/project', label: 'Project Home', icon: 'space_dashboard' },
  { to: '/project-resources', label: 'Project Resources', icon: 'diversity_3' },

  // ---- what happens on site, day to day ----
  { group: 'Site Operations', icon: 'engineering', items: [
    { to: '/hindrances', label: 'Hindrance Register', icon: 'report', module: 'dpr' },
    { to: '/eot', label: 'Extension of Time', icon: 'gavel', module: 'dpr' },
    { to: '/dpr', label: 'Daily Progress', icon: 'pending_actions', module: 'dpr' },
    { to: '/machines', label: 'Machine Status', icon: 'precision_manufacturing', module: 'machines' },
    { to: '/expenses', label: 'Daily Expenses', icon: 'payments', module: 'expenses' },
  ] },

  // ---- the whole store / inventory function, in one place ----
  { group: 'Store & Inventory', icon: 'inventory_2', items: [
    { to: '/warehouses', label: 'Warehouses', icon: 'warehouse', module: 'store' },
    { to: '/stock-dashboard', label: 'Stock Health', icon: 'monitoring', module: 'store' },
    { to: '/material-requests', label: 'Material Requests', icon: 'assignment', module: 'store' },
    { to: '/stock-movements', label: 'Stock Movements', icon: 'inventory', module: 'store' },
    { to: '/transfers', label: 'Stock Transfers', icon: 'local_shipping', module: 'store' },
    { to: '/availability', label: 'Stock Availability', icon: 'travel_explore', module: 'store' },
    { to: '/batches', label: 'Batches & Expiry', icon: 'event_busy', module: 'store' },
    { to: '/material-norms', label: 'Consumption & Wastage', icon: 'balance', module: 'store' },
    { to: '/stock-reports', label: 'Stock Reports', icon: 'assessment', module: 'store' },
    { to: '/store', label: 'Store IN / OUT (old)', icon: 'history', module: 'store' },
  ] },

  { group: 'BOQ & Billing', icon: 'request_quote', items: [
    { to: '/boq', label: 'BOQ', icon: 'request_quote', module: 'boq' },
    { to: '/measurement-book', label: 'Measurement Book', icon: 'straighten', module: 'measurement_book' },
    { to: '/billing', label: 'RA Billing', icon: 'receipt_long', module: 'billing' },
    { to: '/boq-dashboard', label: 'BOQ Dashboard', icon: 'dashboard', module: 'boq_dashboard' },
    { to: '/boq-budget', label: 'BOQ Budget', icon: 'account_balance_wallet', module: 'boq_budget' },
  ] },

  { group: 'Procurement', icon: 'shopping_cart', items: [
    { to: '/purchase', label: 'Purchase Requests', icon: 'shopping_cart', module: 'purchase_requests' },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: 'receipt_long', module: 'purchase_requests' },
  ] },

  // everything to do with vendors, in one place
  { group: 'Vendors', icon: 'store', items: [
    { to: '/vendors', label: 'Vendor Database', icon: 'store', module: 'work_orders' },
    { to: '/work-orders', label: 'Work Orders', icon: 'assignment_turned_in', module: 'work_orders' },
    { to: '/vendor-bills', label: 'Vendor Bills', icon: 'request_quote', module: 'vendor_bills' },
    { to: '/vendor-issues', label: 'Issued Items', icon: 'assignment_return', module: 'store' },
    { to: '/vendor-payments', label: 'Payments & Advances', icon: 'payments', module: 'work_orders' },
    { to: '/vendor-progress', label: 'Vendor Progress', icon: 'trending_up', module: 'work_orders' },
    { to: '/vendor-reports', label: 'Vendor Reports', icon: 'assessment', module: 'work_orders' },
    { to: '/vendor-admin', label: 'Vendor Admin', icon: 'admin_panel_settings', module: 'work_orders' },
  ] },

  // ---- everything an HR / site-admin person does ----
  { group: 'HR', icon: 'badge', items: [
    { to: '/attendance', label: 'Attendance', icon: 'event_available', module: 'attendance' },
    { to: '/leaves', label: 'Leave & Holidays', icon: 'beach_access', module: 'leaves' },
    { to: '/labour', label: 'Labour & Wages', icon: 'groups', module: 'labour' },
    { to: '/labour-dashboard', label: 'Labour Dashboard', icon: 'monitoring', module: 'labour' },
  ] },

  // personal — everyone has these, so they sit at the top level
  { to: '/tasks', label: 'Tasks', icon: 'task_alt' },
  { to: '/my-imprest', label: 'My Imprest', icon: 'account_balance_wallet' },
  { to: '/my-payslips', label: 'My Payslips', icon: 'receipt_long' },
  { to: '/notices', label: 'Notice Board', icon: 'campaign' },

  { group: 'Documents', icon: 'folder_open', items: [
    { to: '/drawings', label: 'Drawings', icon: 'design_services', module: 'drawings' },
    { to: '/correspondence', label: 'Correspondence', icon: 'mail', module: 'correspondence' },
    { to: '/contracts', label: 'Contracts', icon: 'gavel', module: 'contracts' },
    { to: '/documents', label: 'Documents', icon: 'folder_open', module: 'documents' },
  ] },

  { group: 'Reports', icon: 'analytics', items: [
    { to: '/reports', label: 'Reports', icon: 'analytics', module: 'reports' },
    { to: '/monthly-performance', label: 'Monthly Performance', icon: 'speed', module: 'monthly_performance' },
    { to: '/ai-brief', label: 'AI Site Brief', icon: 'psychology', module: 'reports' },
  ] },
]

const ADMIN_NAV: Leaf[] = []

// ---- HEAD OFFICE panel: its own sidebar (admin only) ----
const HO_NAV: Entry[] = [
  { to: '/head-office', label: 'Dashboard', icon: 'dashboard' },
  { to: '/projects', label: 'Projects', icon: 'domain' },
  { to: '/notices', label: 'Notice Board', icon: 'campaign' },

  { group: 'Payroll', icon: 'payments', items: [
    { to: '/payroll', label: 'Run Payroll', icon: 'payments' },
    { to: '/payroll-setup', label: 'Payroll Setup', icon: 'settings' },
    { to: '/payroll-advances', label: 'Overtime, Loans & Advances', icon: 'more_time' },
    { to: '/payroll-reports', label: 'Payroll Reports', icon: 'assessment' },
  ] },

  { group: 'People', icon: 'badge', items: [
    { to: '/employees', label: 'Employees', icon: 'badge' },
    { to: '/labour-dashboard', label: 'Labour Dashboard', icon: 'monitoring' },
    { to: '/team', label: 'Team', icon: 'group_add' },
    { to: '/designations', label: 'Designations', icon: 'work' },
    { to: '/permissions', label: 'Permissions', icon: 'lock' },
    { to: '/admin/staff', label: 'Staff & Access', icon: 'admin_panel_settings' },
  ] },

  { group: 'Vendors', icon: 'store', items: [
    { to: '/vendors', label: 'Vendor Database', icon: 'store' },
    { to: '/work-orders', label: 'Work Orders', icon: 'assignment_turned_in' },
    { to: '/vendor-bills', label: 'Vendor Bills', icon: 'request_quote' },
    { to: '/vendor-issues', label: 'Issued Items', icon: 'assignment_return' },
    { to: '/vendor-payments', label: 'Payments & Advances', icon: 'payments' },
    { to: '/vendor-progress', label: 'Vendor Progress', icon: 'trending_up' },
    { to: '/vendor-reports', label: 'Vendor Reports', icon: 'assessment' },
    { to: '/vendor-admin', label: 'Vendor Admin', icon: 'admin_panel_settings' },
  ] },

  { group: 'Store & Inventory', icon: 'inventory_2', items: [
    { to: '/warehouses', label: 'Warehouses', icon: 'warehouse' },
    { to: '/stock-dashboard', label: 'Stock Health', icon: 'monitoring' },
    { to: '/availability', label: 'Stock Availability', icon: 'travel_explore' },
    { to: '/stock-movements', label: 'Stock Movements', icon: 'inventory' },
    { to: '/material-requests', label: 'Material Requests', icon: 'assignment' },
    { to: '/transfers', label: 'Stock Transfers', icon: 'local_shipping' },
    { to: '/batches', label: 'Batches & Expiry', icon: 'event_busy' },
    { to: '/material-norms', label: 'Consumption & Wastage', icon: 'balance' },
    { to: '/stock-reports', label: 'Stock Reports', icon: 'assessment' },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: 'receipt_long' },
    { to: '/inventory', label: 'Inventory Masters', icon: 'category' },
  ] },

  { group: 'Assets', icon: 'precision_manufacturing', items: [
    { to: '/assets', label: 'Company Assets', icon: 'precision_manufacturing' },
  ] },

  { group: 'Site Operations', icon: 'engineering', items: [
    { to: '/hindrances', label: 'Hindrance Register', icon: 'report' },
    { to: '/eot', label: 'Extension of Time', icon: 'gavel' },
  ] },

  { group: 'Accounting', icon: 'account_balance', items: [
    { to: '/accounting', label: 'Chart of Accounts', icon: 'account_balance' },
    { to: '/give-imprest', label: 'Staff Imprest', icon: 'volunteer_activism' },
    { to: '/bank-recon', label: 'Bank Reconciliation', icon: 'account_balance_wallet' },
  ] },

  { group: 'Financial Reports', icon: 'assessment', items: [
    { to: '/finance-reports', label: 'Financial Reports', icon: 'assessment' },
    { to: '/gst', label: 'GST Reports', icon: 'receipt_long' },
    { to: '/admin/reports', label: 'Reports & Export', icon: 'download' },
    { to: '/accounting-export', label: 'Tally / Zoho Export', icon: 'swap_horiz' },
  ] },

  { group: 'Settings', icon: 'settings', items: [
    { to: '/boq-schedules', label: 'Schedule Master', icon: 'list_alt' },
    { to: '/masters', label: 'Master Data', icon: 'database' },
    { to: '/admin/invite', label: 'Invite Code', icon: 'qr_code_2' },
    { to: '/bugs', label: 'Bug Reports', icon: 'bug_report' },
  ] },
]

// routes that belong to the Head Office panel
const BOTTOM_NAV = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/projects', label: 'Projects', icon: 'domain' },
  { to: '/expenses', label: 'Expenses', icon: 'payments' },
  { to: '/store', label: 'Store', icon: 'inventory_2' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 py-2.5 pr-4 text-[11px] font-medium tracking-[0.12em] uppercase transition-colors duration-150 ${
    isActive
      ? 'text-[var(--text)] border-l-2 border-[var(--accent)] pl-[14px]'
      : 'text-[var(--faint)] hover:text-[var(--text)] pl-4 border-l-2 border-transparent'
  }`

const childLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 py-2 pr-4 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors duration-150 ${
    isActive
      ? 'text-[var(--text)] border-l-2 border-[var(--accent)] pl-[34px]'
      : 'text-[var(--faint)] hover:text-[var(--text)] pl-9 border-l-2 border-transparent'
  }`

export default function AppShell() {
  const { profile, user, signOut, isAdmin, can, mustChangePassword } = useAuth()
  const { t } = useLang()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { projects, activeProject, setActiveProject, loading: projectsLoading } = useProject()
  const [open, setOpen] = useState(false)

  // Head Office panel mode: admin is inside a HO route → show the HO sidebar instead
  // ⚠️ THE WORKSPACE IS A CHOICE, NOT A URL LOOKUP.
  //
  //    This used to be:
  //        const inHeadOffice = isAdmin && HO_ROUTES.has(pathname)
  //
  //    HO_ROUTES was a hand-maintained list of paths. Open a page that was
  //    not on the list — Employees, Vendors, Inventory, Warehouses — and the
  //    app decided you had left Head Office, and silently dropped you into a
  //    project workspace. You never picked a project. It picked one for you.
  //
  //    Worse, every new page I added was a fresh trapdoor until I remembered
  //    to add it to the list. That is not a rule; it is a list of exceptions
  //    pretending to be one.
  //
  //    Now: you are in Head Office because you SAID so. You stay there until
  //    you say otherwise. The URL has no vote.
  const { inHeadOffice, enterHeadOffice, enterProject } = useWorkspace()

  const leafVisible = (n: Leaf) => {
    if (n.adminOnly) return isAdmin
    if (n.module) return can(n.module, 'view')
    return true
  }

  // which group holds the current route?
  const activeGroup = (() => {
    for (const e of NAV) {
      if (isGroup(e) && e.items.some(i => i.to === pathname)) return e.group
    }
    return null
  })()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => (activeGroup ? { [activeGroup]: true } : {})
  )

  // auto-expand the group containing the current route
  useEffect(() => {
    if (activeGroup) setOpenGroups(prev => ({ ...prev, [activeGroup]: true }))
  }, [activeGroup])

  const visibleAdmin = (isAdmin && !inHeadOffice) ? ADMIN_NAV : []
  const initials = (profile?.full_name || user?.email || 'U').slice(0, 2).toUpperCase()

  // First-login forced password change: block the whole app until done
  if (mustChangePassword) return <ChangePassword forced />

  return (
    <div className="h-full flex bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-30 inset-y-0 left-0 w-[236px] bg-[var(--bg)] border-r border-[var(--line)] flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 h-[72px] flex items-center gap-3 border-b border-[var(--line)] flex-shrink-0">
          <span className="w-[7px] h-[7px] bg-[var(--accent)] rounded-[1px] mt-[1px] flex-shrink-0" />
          <div>
            <div className="text-[13px] font-semibold tracking-[0.24em] text-[var(--text)] leading-none">AADVIK</div>
            <div className={`text-[9px] uppercase tracking-[0.24em] mt-1 ${inHeadOffice ? 'text-[var(--accent)] font-bold' : 'text-[var(--faint)]'}`}>
              {inHeadOffice ? 'Head Office' : 'Construction OS'}
            </div>
          </div>
          <button
            className="lg:hidden ml-auto text-[var(--faint)] hover:text-[var(--text)] p-1 -mr-1"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {isAdmin && (
            <div className="px-4 pb-3 mb-2 border-b border-[var(--line)]">
              {/* ⚠️ These are the ONLY two ways to change workspace.
                  Nothing else — no page, no link, no route — may move you
                  between Head Office and a project. */}
              {inHeadOffice ? (
                <button
                  onClick={() => { enterProject(); setOpen(false); navigate('/project') }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
                  Go to Project Workspace
                </button>
              ) : (
                <button
                  onClick={() => { enterHeadOffice(); setOpen(false); navigate('/head-office') }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25 hover:bg-[var(--accent)]/15 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>corporate_fare</span>
                  Back to Head Office
                </button>
              )}
            </div>
          )}
          {(inHeadOffice ? HO_NAV : NAV).map(e => {
            if (!isGroup(e)) {
              if (!leafVisible(e)) return null
              return (
                <NavLink key={e.to} to={e.to} end={e.to === '/'} onClick={() => setOpen(false)} className={linkClass}>
                  <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>{e.icon}</span>
                  {t(e.label)}
                </NavLink>
              )
            }
            // group
            const items = e.items.filter(leafVisible)
            if (!items.length) return null
            const expanded = !!openGroups[e.group]
            const groupActive = items.some(i => i.to === pathname)
            return (
              <div key={e.group}>
                <button
                  onClick={() => setOpenGroups(prev => ({ ...prev, [e.group]: !prev[e.group] }))}
                  className={`w-full flex items-center gap-3 py-2.5 pl-4 pr-3 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors ${groupActive ? 'text-[var(--text)]' : 'text-[var(--faint)] hover:text-[var(--text)]'}`}
                >
                  <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>{e.icon}</span>
                  <span className="flex-1 text-left">{t(e.group)}</span>
                  <span className="material-symbols-outlined flex-shrink-0 transition-transform duration-200" style={{ fontSize: '18px', transform: expanded ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </button>
                {expanded && (
                  <div className="space-y-0.5 pb-1">
                    {items.map(i => (
                      <NavLink key={i.to} to={i.to} onClick={() => setOpen(false)} className={childLinkClass}>
                        <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '16px' }}>{i.icon}</span>
                        {t(i.label)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {visibleAdmin.length > 0 && (
            <>
              <div className="mt-5 px-4 pt-4 pb-2 text-[9px] font-semibold text-[var(--faint)] uppercase tracking-[0.24em] border-t border-[var(--line)] flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[var(--accent)]" /> {t('Admin')}
              </div>
              {visibleAdmin.map(n => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={linkClass}>
                  <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>{n.icon}</span>
                  {t(n.label)}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-[var(--line)] flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-center text-[var(--text)] text-[11px] font-semibold flex-shrink-0">{initials}</div>
            <div className="overflow-hidden">
              <div className="text-[12px] font-medium text-[var(--text)] truncate">{profile?.full_name || user?.email}</div>
              <div className="text-[10px] text-[var(--faint)] capitalize tracking-wide">{profile?.role || t('member')}</div>
            </div>
          </div>
          <button onClick={signOut} className="btn btn-ghost w-full" style={{ fontSize: '11px', padding: '9px 12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>logout</span> {t('Logout')}
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[72px] border-b border-[var(--line)] flex items-center gap-3 px-4 lg:px-6 bg-[var(--bg)] sticky top-0 z-10 flex-shrink-0">
          <button className="lg:hidden btn btn-ghost" style={{ padding: '8px', minWidth: 0 }} onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          {inHeadOffice ? (
            // In Head Office there is no project to switch. Say so plainly,
            // so nobody wonders why the project name has vanished.
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25">
              <span className="material-symbols-outlined text-[var(--accent)]" style={{ fontSize: '18px' }}>
                corporate_fare
              </span>
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--accent)] font-bold leading-none">
                  Head Office
                </div>
                <div className="text-[12px] font-medium text-[var(--text)] leading-tight mt-0.5">
                  All projects
                </div>
              </div>
            </div>
          ) : (
            <ProjectSwitcher />
          )}
          <div className="flex-1" />
          <NotificationBell />
          <LanguageToggle />
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 flex-shrink-0"></span>
            <span className="text-[10px] font-mono tracking-[0.24em] text-[var(--faint)] uppercase">{t('Live')}</span>
          </div>
        </header>

        {/* A project workspace with no project chosen: say so, rather than
            showing forty empty tables. Removing the auto-select means this
            state is now possible — and it is the honest one. */}
        {!inHeadOffice && !activeProject && !projectsLoading && projects.length > 0 && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <span className="material-symbols-outlined text-[var(--faint)]" style={{ fontSize: '40px' }}>
                domain
              </span>
              <h2 className="font-headline text-xl font-semibold text-[var(--text)] mt-3">
                Pick a project
              </h2>
              <p className="text-sm text-[var(--text-2)] mt-1">
                This is a project workspace. Choose which site you are working on,
                or go to Head Office to see everything at once.
              </p>
              <div className="flex flex-col gap-2 mt-5">
                {projects.slice(0, 5).map(p => (
                  <button key={p.id}
                    onClick={() => setActiveProject(p)}
                    className="px-4 py-2.5 rounded-lg border border-[var(--line)] hover:bg-white/[0.04] text-[13px] font-medium text-[var(--text)] transition-colors">
                    {p.name}
                  </button>
                ))}
                {isAdmin && (
                  <button
                    onClick={() => { enterHeadOffice(); navigate('/head-office') }}
                    className="px-4 py-2.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[13px] font-semibold text-[var(--accent)] mt-1">
                    Go to Head Office instead
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <main className="flow-bg flex-1 overflow-y-auto p-4 lg:p-8 pb-20 lg:pb-8">
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex justify-around items-center h-16 bg-[var(--bg)] border-t border-[var(--line)]">
          {BOTTOM_NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors ${isActive ? 'text-[var(--text)]' : 'text-[var(--faint)]'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{n.icon}</span>
              <span className="text-[10px] font-medium tracking-wide">{t(n.label)}</span>
            </NavLink>
          ))}
          <button className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[var(--faint)]" onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>menu</span>
            <span className="text-[10px] font-medium tracking-wide">{t('More')}</span>
          </button>
        </nav>
      </div>
    </div>
  )
}

function ProjectSwitcher() {
  const { projects, activeProject, setActiveProject, loading } = useProject()
  const { t } = useLang()
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
    return <div className="text-[11px] text-[var(--faint)] font-mono tracking-wide">{t('Loading projects…')}</div>
  }

  if (!projects.length) {
    return (
      <a href="/projects" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--line)] text-[var(--text-2)] text-[11px] font-medium hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
        {t('Create first project')}
      </a>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--text-2)] transition-colors max-w-[240px] sm:max-w-none"
      >
        <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-[var(--faint)] hidden sm:inline">{t('Project')}</span>
        <div className="text-left overflow-hidden">
          <div className="text-[12px] font-medium text-[var(--text)] truncate">{activeProject?.name ?? t('Pick a project')}</div>
          {activeProject?.code && <div className="text-[9px] text-[var(--faint)] font-mono uppercase tracking-[0.16em]">{activeProject.code}</div>}
        </div>
        <span className="material-symbols-outlined text-[var(--faint)] flex-shrink-0" style={{ fontSize: '16px' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] bg-[var(--card)] border border-[var(--line)] rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.4)] overflow-hidden z-30">
          <div className="px-4 py-3 border-b border-[var(--line)] text-[10px] font-mono text-[var(--faint)] uppercase tracking-[0.2em]">
            {t('Switch project')}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {projects.map(p => {
              const isActive = activeProject?.id === p.id
              return (
                <button key={p.id}
                  onClick={() => { setActiveProject(p); setOpen(false) }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${isActive ? 'bg-[var(--card-2)]' : 'hover:bg-[var(--card-2)]'}`}
                >
                  <span className={`material-symbols-outlined flex-shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--faint)]'}`}
                    style={{ fontSize: '18px', fontVariationSettings: isActive ? "'FILL' 1" : undefined }}>
                    {isActive ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--text)] truncate">{p.name}</div>
                    <div className="text-[10px] text-[var(--faint)] truncate">
                      {p.code ? <span className="font-mono uppercase tracking-wide">{p.code}</span> : null}
                      {p.code && p.client ? ' · ' : ''}
                      {p.client}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="border-t border-[var(--line)]">
            <a href="/projects" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-[11px] font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--card-2)] uppercase tracking-[0.14em] transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              {t('New project')}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}