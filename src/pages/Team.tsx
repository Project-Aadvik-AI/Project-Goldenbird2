import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Member = { id: string; full_name: string | null; role: string; created_at: string }

const ROLE_STYLES: Record<string, string> = {
  owner: 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/20',
  manager: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  accounts: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
  engineer: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  storekeeper: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  supervisor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

export default function Team() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role, created_at').order('created_at')
      .then(({ data }) => { setMembers((data as Member[]) ?? []); setLoading(false) })
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Team</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Members in your organisation</p>
      </div>

      <div className="card p-4">
        <div className="space-y-1">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/[0.03] transition-colors">
              <div className="w-9 h-9 rounded-full bg-[#ff8f00]/15 flex items-center justify-center text-[#ffb87b] font-bold text-sm flex-shrink-0">
                {(m.full_name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[#e2e2e8] truncate">{m.full_name || 'Unnamed'}</div>
                <div className="text-[11px] text-[#dcc1ae]/60">Joined {m.created_at.slice(0, 10)}</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide flex-shrink-0 ${ROLE_STYLES[m.role] || 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                {m.role}
              </span>
            </div>
          ))}
          {!members.length && !loading && (
            <div className="text-[#dcc1ae]/60 text-sm py-4 text-center">No members found.</div>
          )}
          {loading && <div className="text-[#dcc1ae] text-sm py-4 text-center">Loading…</div>}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-1">Inviting teammates</div>
          <div className="text-[12px] text-[#dcc1ae]/60 leading-relaxed">
            Full invite flow via Supabase Auth email invite — coming in next phase. For now, ask teammates to sign up at the app URL; an owner can then update their role directly in the Supabase dashboard (profiles table).
          </div>
        </div>
      </div>
    </div>
  )
}