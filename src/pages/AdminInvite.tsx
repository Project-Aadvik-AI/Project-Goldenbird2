import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function AdminInvite() {
  const { isAdmin, profile } = useAuth()
  const [code, setCode] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.org_id) return
    supabase.from('organizations').select('invite_code, name').eq('id', profile.org_id).single()
      .then(({ data }) => {
        setCode((data as any)?.invite_code ?? null)
        setOrgName((data as any)?.name ?? '')
        setLoading(false)
      })
  }, [profile?.org_id])

  async function copy() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!isAdmin) return (
    <div className="card p-8 text-center max-w-md mx-auto mt-8">
      <span className="material-symbols-outlined text-red-400" style={{ fontSize: '32px' }}>lock</span>
      <p className="text-sm text-[#dcc1ae] mt-2">Admin only.</p>
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Invite Code</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Share this code with staff so they can join {orgName || 'your company'}</p>
      </div>

      <div className="card p-8 text-center">
        {loading ? (
          <div className="text-[#dcc1ae]">Loading…</div>
        ) : code ? (
          <>
            <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-widest mb-3">Company Invite Code</div>
            <div className="font-mono text-5xl font-black text-[#ffb87b] tracking-[0.2em] mb-6 select-all">{code}</div>
            <button onClick={copy} className="btn btn-primary">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </>
        ) : (
          <div className="text-red-400">No invite code found. Contact support.</div>
        )}
      </div>

      <div className="card p-5 mt-4">
        <h3 className="text-sm font-bold text-[#e2e2e8] mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>info</span>
          How it works
        </h3>
        <ol className="space-y-2 text-sm text-[#dcc1ae] list-decimal list-inside">
          <li>Share this code with a new staff member.</li>
          <li>They go to the signup page and choose <strong className="text-[#ffb87b]">Join a company</strong>.</li>
          <li>They enter this code with their name, email and password.</li>
          <li>They log in and see <strong className="text-[#ffb87b]">"Awaiting admin approval"</strong> — they can't access anything yet.</li>
          <li>You approve them in <strong className="text-[#ffb87b]">Staff & Permissions</strong> and set which modules and projects they can access.</li>
        </ol>
      </div>
    </div>
  )
}