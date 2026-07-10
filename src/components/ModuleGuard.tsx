import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type Module } from '../lib/auth'

// Wrap a route element to block access when the user's designation
// doesn't grant View on that module. Admins always pass.
export default function ModuleGuard({ module, children }: { module: Module; children: ReactNode }) {
  const { can, isAdmin } = useAuth()
  const navigate = useNavigate()

  if (isAdmin || can(module, 'view')) return <>{children}</>

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="card p-8 text-center max-w-md">
        <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '44px' }}>lock</span>
        <h2 className="font-headline text-xl font-semibold text-[#e2e2e8] mt-3">Access Denied</h2>
        <p className="text-[13px] text-[#dcc1ae] mt-2">
          You don't have permission to open this module. If you think this is a mistake,
          please ask your admin to update your designation's permissions.
        </p>
        <button className="btn btn-primary mt-5" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    </div>
  )
}