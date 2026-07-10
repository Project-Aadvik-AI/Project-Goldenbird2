import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, hasSupabaseConfig } from './supabase'

export type Profile = {
  id: string
  full_name: string | null
  role: string
  org_id: string | null
  status: string
  is_admin: boolean
  must_change_password?: boolean
}

export type Module =
  | 'expenses' | 'store' | 'machines' | 'dpr' | 'labour'
  | 'purchase_requests' | 'reports' | 'hr' | 'documents'
  | 'correspondence' | 'contracts' | 'masters'
  | 'work_orders' | 'drawings' | 'tasks' | 'vendor_bills' | 'purchase'
  | 'boq' | 'boq_dashboard' | 'boq_budget' | 'measurement_book' | 'billing'
  | 'employees' | 'designations' | 'attendance' | 'leaves' | 'payroll'
  | 'monthly_performance'

export type Action = 'view' | 'add' | 'create' | 'edit' | 'delete' | 'approve' | 'export'

type PermRow = {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

// New designation-based permission row (Phase 2/3 RBAC)
type DPermRow = {
  module: string
  can_view: boolean; can_create: boolean; can_edit: boolean
  can_delete: boolean; can_approve: boolean; can_export: boolean
}

type AuthCtx = {
  ready: boolean
  configured: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  isPending: boolean
  isDisabled: boolean
  assignedProjectIds: string[]
  can: (module: Module, action: Action) => boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, fullName: string, orgName: string) => Promise<{ error?: string }>
  signUpJoin: (email: string, password: string, fullName: string, inviteCode: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  reloadPermissions: () => Promise<void>
  mustChangePassword: boolean
  changePassword: (newPassword: string) => Promise<{ error?: string }>
  sendPasswordReset: (email: string) => Promise<{ error?: string }>
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [perms, setPerms] = useState<PermRow[]>([])
  const [dperms, setDperms] = useState<DPermRow[]>([])
  const [rbacActive, setRbacActive] = useState(false)
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([])

  async function loadAll(uid: string) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, role, org_id, status, is_admin, must_change_password')
      .eq('id', uid)
      .single()
    setProfile((prof as Profile) ?? null)

    const [{ data: perm }, { data: up }] = await Promise.all([
      supabase.from('user_permissions').select('module, can_view, can_add, can_edit, can_delete').eq('user_id', uid),
      supabase.from('user_projects').select('project_id').eq('user_id', uid),
    ])
    setPerms((perm as PermRow[]) ?? [])
    setAssignedProjectIds(((up as { project_id: string }[]) ?? []).map(r => r.project_id))

    // ── RBAC: find this login's employee record (by profile_id, else by email) → designation → permissions
    try {
      const email = (prof as Profile & { email?: string })?.id ? null : null
      let emp: { id: string; designation_id: string | null } | null = null
      // by profile_id link first
      const { data: byProfile } = await supabase.from('employees').select('id, designation_id').eq('profile_id', uid).limit(1)
      if (byProfile && byProfile.length) emp = byProfile[0] as any
      // fallback: by email match
      if (!emp) {
        const { data: authUser } = await supabase.auth.getUser()
        const em = authUser?.user?.email
        if (em) {
          const { data: byEmail } = await supabase.from('employees').select('id, designation_id').ilike('email', em).limit(1)
          if (byEmail && byEmail.length) emp = byEmail[0] as any
        }
      }
      if (emp?.designation_id) {
        const { data: dp } = await supabase.from('designation_permissions').select('module, can_view, can_create, can_edit, can_delete, can_approve, can_export').eq('designation_id', emp.designation_id)
        if (dp && dp.length) { setDperms(dp as DPermRow[]); setRbacActive(true) }
        else { setDperms([]); setRbacActive(false) }
      } else { setDperms([]); setRbacActive(false) }
    } catch { setDperms([]); setRbacActive(false) }
  }

  useEffect(() => {
    if (!hasSupabaseConfig) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadAll(data.session.user.id).finally(() => setReady(true))
      else setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadAll(s.user.id)
      else { setProfile(null); setPerms([]); setDperms([]); setRbacActive(false); setAssignedProjectIds([]) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const isAdmin = !!(profile?.is_admin && profile?.status === 'active')
  const isPending = profile?.status === 'pending'
  const isDisabled = profile?.status === 'disabled'

  const can: AuthCtx['can'] = (module, action) => {
    if (isAdmin) return true
    // Phase 3 RBAC: if this user's designation has a permission template, use it
    if (rbacActive) {
      const dr = dperms.find(p => p.module === module)
      if (!dr) return false
      switch (action) {
        case 'view': return dr.can_view
        case 'add':
        case 'create': return dr.can_create
        case 'edit': return dr.can_edit
        case 'delete': return dr.can_delete
        case 'approve': return dr.can_approve
        case 'export': return dr.can_export
        default: return false
      }
    }
    // Legacy fallback (old user_permissions)
    const row = perms.find(p => p.module === module)
    if (!row) return false
    if (action === 'view') return row.can_view
    if (action === 'add' || action === 'create') return row.can_add
    if (action === 'edit') return row.can_edit
    if (action === 'delete') return row.can_delete
    return false
  }

  const reloadPermissions = async () => {
    if (session) await loadAll(session.user.id)
  }

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      // best-effort login history log (never block login if it fails)
      try {
        const { data: u } = await supabase.auth.getUser()
        if (u?.user) {
          await supabase.from('login_history').insert({
            user_id: u.user.id, email: u.user.email,
            event: 'login', user_agent: navigator.userAgent.slice(0, 300),
          })
        }
      } catch { /* ignore */ }
    }
    return { error: error?.message }
  }

  const changePassword: AuthCtx['changePassword'] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }
    // clear the must-change flag + log it
    try {
      const { data: u } = await supabase.auth.getUser()
      if (u?.user) {
        await supabase.from('profiles').update({ must_change_password: false }).eq('id', u.user.id)
        await supabase.from('login_history').insert({ user_id: u.user.id, email: u.user.email, event: 'password_changed', user_agent: navigator.userAgent.slice(0, 300) })
        await loadAll(u.user.id)
      }
    } catch { /* ignore */ }
    return {}
  }

  const sendPasswordReset: AuthCtx['sendPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error: error?.message }
  }

  const signUp: AuthCtx['signUp'] = async (email, password, fullName, orgName) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, org_name: orgName } }
    })
    if (error) return { error: error.message }
    if (data.user && !data.session) return { error: 'Check your email to confirm your account, then sign in.' }
    return {}
  }

  const signUpJoin: AuthCtx['signUpJoin'] = async (email, password, fullName, inviteCode) => {
    const code = inviteCode.trim()
    // Pre-check the code so we can show a friendly error before submitting.
    const { data: orgId, error: rpcErr } = await supabase.rpc('resolve_invite', { code })
    if (rpcErr) return { error: rpcErr.message }
    if (!orgId) return { error: 'Invalid invite code. Ask your admin for the correct code.' }
    // The org is authorized SERVER-SIDE from the code by the signup trigger;
    // we never pass a client-chosen org id.
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, invite_code: code } }
    })
    if (error) return { error: error.message }
    if (data.user && !data.session) return { error: 'Check your email to confirm your account, then sign in.' }
    return {}
  }

  const signOut = async () => { await supabase.auth.signOut() }

  return (
    <Ctx.Provider value={{
      ready, configured: hasSupabaseConfig, session, user: session?.user ?? null,
      profile, isAdmin, isPending, isDisabled, assignedProjectIds, can,
      signIn, signUp, signUpJoin, signOut, reloadPermissions,
      mustChangePassword: !!profile?.must_change_password,
      changePassword, sendPasswordReset,
    }}>
      {children}
    </Ctx.Provider>
  )
}