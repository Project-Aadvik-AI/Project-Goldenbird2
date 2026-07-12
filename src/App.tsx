import { Routes, Route, Navigate } from 'react-router-dom'
import ModuleGuard from './components/ModuleGuard'
import ChangePassword from './pages/ChangePassword'
import { useAuth } from './lib/auth'
import { ProjectProvider } from './lib/project'
import AuthPages from './components/AuthPages'
import Home from './pages/site/Home'
import About from './pages/site/About'
import ProjectsPage from './pages/site/ProjectsPage'
import Growth from './pages/site/Growth'
import Contact from './pages/site/Contact'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import Store from './pages/Store'
import Machines from './pages/Machines'
import DPR from './pages/DPR'
import Labour from './pages/Labour'
import Purchase from './pages/Purchase'
import Reports from './pages/Reports'
import Masters from './pages/Masters'
import Team from './pages/Team'
import AIBrief from './pages/AIBrief'
import Projects from './pages/Projects'
import OrgDashboard from './pages/OrgDashboard'
import Employees from './pages/Employees'
import Designations from './pages/Designations'
import Permissions from './pages/Permissions'
import Boq from './pages/Boq'
import BoqEditor from './pages/BoqEditor'
import MeasurementBook from './pages/MeasurementBook'
import MonthlyPerformance from './pages/MonthlyPerformance'
import Billing from './pages/Billing'
import BoqDashboard from './pages/BoqDashboard'
import BoqBudget from './pages/BoqBudget'
import BoqSchedules from './pages/BoqSchedules'
import MyImprest from './pages/MyImprest'
import GiveImprest from './pages/GiveImprest'
import HeadOffice from './pages/HeadOffice'
import Accounting from './pages/Accounting'
import Inventory from './pages/Inventory'
import StockMovements from './pages/StockMovements'
import StockReports from './pages/StockReports'
import PurchaseOrders from './pages/PurchaseOrders'
import MaterialNorms from './pages/MaterialNorms'
import FinanceReports from './pages/FinanceReports'
import GstReports from './pages/GstReports'
import BankRecon from './pages/BankRecon'
import AccountingExport from './pages/AccountingExport'
import ProjectResources from './pages/ProjectResources'
import Assets from './pages/Assets'
import AssetDetail from './pages/AssetDetail'
import BugReports from './pages/BugReports'
import BillingDetail from './pages/BillingDetail'
import EmployeeDetail from './pages/EmployeeDetail'
import Attendance from './pages/Attendance'
import Leaves from './pages/Leaves'
import Documents from './pages/Documents'
import Correspondence from './pages/Correspondence'
import Contracts from './pages/Contracts'
import AdminStaff from './pages/AdminStaff'
import AdminInvite from './pages/AdminInvite'
import AdminReports from './pages/AdminReports'
import WorkOrders from './pages/WorkOrders'
import Drawings from './pages/Drawings'
import Tasks from './pages/Tasks'
import VendorBills from './pages/VendorBills'

export default function App() {
  const { ready, configured, session, profile, isPending, isDisabled, signOut } = useAuth()

  if (!configured) return <ConfigNotice />
  if (!ready) return <Splash />

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/growth" element={<Growth />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<AuthPages />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (profile && isPending) return <PendingScreen name={profile.full_name} onSignOut={signOut} />
  if (profile && isDisabled) return <DisabledScreen onSignOut={signOut} />

  return (
    <ProjectProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<OrgDashboard />} />
          <Route path="/project" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/expenses" element={<ModuleGuard module="expenses"><Expenses /></ModuleGuard>} />
          <Route path="/store" element={<ModuleGuard module="store"><Store /></ModuleGuard>} />
          <Route path="/machines" element={<ModuleGuard module="machines"><Machines /></ModuleGuard>} />
          <Route path="/dpr" element={<ModuleGuard module="dpr"><DPR /></ModuleGuard>} />
          <Route path="/labour" element={<ModuleGuard module="labour"><Labour /></ModuleGuard>} />
          <Route path="/purchase" element={<ModuleGuard module="purchase_requests"><Purchase /></ModuleGuard>} />
          <Route path="/reports" element={<ModuleGuard module="reports"><Reports /></ModuleGuard>} />
          <Route path="/masters" element={<Masters />} />
          <Route path="/team" element={<Team />} />
          <Route path="/employees" element={<ModuleGuard module="employees"><Employees /></ModuleGuard>} />
          <Route path="/designations" element={<Designations />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/boq" element={<ModuleGuard module="boq"><Boq /></ModuleGuard>} />
          <Route path="/boq/:id" element={<BoqEditor />} />
          <Route path="/measurement-book" element={<ModuleGuard module="measurement_book"><MeasurementBook /></ModuleGuard>} />
          <Route path="/monthly-performance" element={<ModuleGuard module="monthly_performance"><MonthlyPerformance /></ModuleGuard>} />
          <Route path="/billing" element={<ModuleGuard module="billing"><Billing /></ModuleGuard>} />
          <Route path="/boq-dashboard" element={<ModuleGuard module="boq_dashboard"><BoqDashboard /></ModuleGuard>} />
          <Route path="/boq-budget" element={<ModuleGuard module="boq_budget"><BoqBudget /></ModuleGuard>} />
          <Route path="/boq-schedules" element={<BoqSchedules />} />
          <Route path="/my-imprest" element={<MyImprest />} />
          <Route path="/give-imprest" element={<GiveImprest />} />
          <Route path="/head-office" element={<HeadOffice />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/stock-movements" element={<ModuleGuard module="store"><StockMovements /></ModuleGuard>} />
          <Route path="/stock-reports" element={<ModuleGuard module="store"><StockReports /></ModuleGuard>} />
          <Route path="/purchase-orders" element={<ModuleGuard module="purchase_requests"><PurchaseOrders /></ModuleGuard>} />
          <Route path="/material-norms" element={<ModuleGuard module="store"><MaterialNorms /></ModuleGuard>} />
          <Route path="/finance-reports" element={<FinanceReports />} />
          <Route path="/gst" element={<GstReports />} />
          <Route path="/bank-recon" element={<BankRecon />} />
          <Route path="/accounting-export" element={<AccountingExport />} />
          <Route path="/project-resources" element={<ProjectResources />} />
          <Route path="/assets" element={<ModuleGuard module="machines"><Assets /></ModuleGuard>} />
          <Route path="/assets/:id" element={<AssetDetail />} />
          <Route path="/bugs" element={<BugReports />} />
          <Route path="/billing/:id" element={<BillingDetail />} />
          <Route path="/employees/:id" element={<EmployeeDetail />} />
          <Route path="/attendance" element={<ModuleGuard module="attendance"><Attendance /></ModuleGuard>} />
          <Route path="/leaves" element={<ModuleGuard module="leaves"><Leaves /></ModuleGuard>} />
          <Route path="/documents" element={<ModuleGuard module="documents"><Documents /></ModuleGuard>} />
          <Route path="/correspondence" element={<ModuleGuard module="correspondence"><Correspondence /></ModuleGuard>} />
          <Route path="/contracts" element={<ModuleGuard module="contracts"><Contracts /></ModuleGuard>} />
          <Route path="/admin/staff" element={<AdminStaff />} />
          <Route path="/admin/invite" element={<AdminInvite />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/work-orders" element={<ModuleGuard module="work_orders"><WorkOrders /></ModuleGuard>} />
          <Route path="/drawings" element={<ModuleGuard module="drawings"><Drawings /></ModuleGuard>} />
          <Route path="/tasks" element={<ModuleGuard module="tasks"><Tasks /></ModuleGuard>} />
          <Route path="/vendor-bills" element={<ModuleGuard module="vendor_bills"><VendorBills /></ModuleGuard>} />
          <Route path="/ai-brief" element={<AIBrief />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProjectProvider>
  )
}

function Splash() {
  return <div className="h-full grid place-items-center text-muted">Loading…</div>
}

function PendingScreen({ name, onSignOut }: { name: string | null; onSignOut: () => void }) {
  return (
    <div className="h-full grid place-items-center p-6 bg-[#0F1115]">
      <div className="card max-w-md p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 grid place-items-center mx-auto mb-4 border border-amber-500/20">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '28px' }}>hourglass_top</span>
        </div>
        <h2 className="font-headline text-xl font-semibold text-[#e2e2e8] mb-2">Awaiting admin approval</h2>
        <p className="text-sm text-[#dcc1ae] mb-6">
          Hi {name || 'there'}, your account has been created and is waiting for your company admin to approve access and assign your permissions.
        </p>
        <button onClick={onSignOut} className="btn btn-ghost w-full">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span> Sign out
        </button>
      </div>
    </div>
  )
}

function DisabledScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="h-full grid place-items-center p-6 bg-[#0F1115]">
      <div className="card max-w-md p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 grid place-items-center mx-auto mb-4 border border-red-500/20">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '28px' }}>block</span>
        </div>
        <h2 className="font-headline text-xl font-semibold text-[#e2e2e8] mb-2">Access disabled</h2>
        <p className="text-sm text-[#dcc1ae] mb-6">Your account has been disabled by the admin. Please contact them if this is a mistake.</p>
        <button onClick={onSignOut} className="btn btn-ghost w-full">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span> Sign out
        </button>
      </div>
    </div>
  )
}

function ConfigNotice() {
  return (
    <div className="h-full grid place-items-center p-6">
      <div className="card max-w-md p-6 text-center">
        <div className="text-2xl font-black text-brand mb-2">आ Aadvik AI</div>
        <div className="font-bold mb-2">Connect Supabase to start</div>
        <p className="text-sm text-muted">Create a Supabase project, run <span className="mono">supabase/schema.sql</span>, then set <span className="mono">VITE_SUPABASE_URL</span> and <span className="mono">VITE_SUPABASE_ANON_KEY</span> in a <span className="mono">.env</span> file. See DEPLOY_GUIDE.md.</p>
      </div>
    </div>
  )
}