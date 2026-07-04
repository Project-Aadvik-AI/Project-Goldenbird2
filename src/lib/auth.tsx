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
}

export type Module =
  | 'expenses' | 'store' | 'machines' | 'dpr' | 'labour'
  | 'purchase_requests' | 'reports' | 'hr' | 'documents'
  | 'correspondence' | 'contracts' | 'masters'
  | 'work_orders' | 'drawings' | 'tasks' | 'vendor_bills' | 'purchase'

export type Action = 'view' | 'add' | 'edit' | 'delete'

type PermRow = {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
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
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [perms, setPerms] = useState<PermRow[]>([])
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([])

  async function loadAll(uid: string) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, role, org_id, status, is_admin')
      .eq('id', uid)
      .single()
    setProfile((prof as Profile) ?? null)

    const [{ data: perm }, { data: up }] = await Promise.all([
      supabase.from('user_permissions').select('module, can_view, can_add, can_edit, can_delete').eq('user_id', uid),
      supabase.from('user_projects').select('project_id').eq('user_id', uid),
    ])
    setPerms((perm as PermRow[]) ?? [])
    setAssignedProjectIds(((up as { project_id: string }[]) ?? []).map(r => r.project_id))
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
      else { setProfile(null); setPerms([]); setAssignedProjectIds([]) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const isAdmin = !!(profile?.is_admin && profile?.status === 'active')
  const isPending = profile?.status === 'pending'
  const isDisabled = profile?.status === 'disabled'

  const can: AuthCtx['can'] = (module, action) => {
    if (isAdmin) return true
    const row = perms.find(p => p.module === module)
    if (!row) return false
    if (action === 'view') return row.can_view
    if (action === 'add') return row.can_add
    if (action === 'edit') return row.can_edit
    if (action === 'delete') return row.can_delete
    return false
  }

  const reloadPermissions = async () => {
    if (session) await loadAll(session.user.id)
  }

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
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
    }}>
      {children}
    </Ctx.Provider>
  )
}