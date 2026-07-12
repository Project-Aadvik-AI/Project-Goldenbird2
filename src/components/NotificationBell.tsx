import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Notif = {
  id: string; type: string | null; title: string | null; body: string | null
  link: string | null; is_read: boolean; created_at: string
}

const TYPE_ICON: Record<string, string> = {
  low_stock: 'warning',
  approval_pending: 'pending_actions',
  contract_expiry: 'event_busy',
  high_value: 'payments',
  info: 'info',
}
const TYPE_COLOR: Record<string, string> = {
  low_stock: 'text-amber-400',
  approval_pending: 'text-blue-400',
  contract_expiry: 'text-red-400',
  high_value: 'text-emerald-400',
  info: 'text-[#dcc1ae]',
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-IN')
}

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'unread' | 'all'>('unread')

  async function load() {
    if (!user) return
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setRows((data as Notif[]) ?? [])
  }

  useEffect(() => {
    load()
    // refresh periodically — cheap, and keeps the badge honest
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [user?.id])

  const unread = useMemo(() => rows.filter(r => !r.is_read), [rows])
  const shown = tab === 'unread' ? unread : rows

  async function markRead(n: Notif) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setRows(p => p.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    if (n.link) { setOpen(false); navigate(n.link) }
  }

  async function markAllRead() {
    if (!user || !unread.length) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false)
    setRows(p => p.map(x => ({ ...x, is_read: true })))
  }

  if (!user) return null

  return (
    <>
      <button
        onClick={() => { setOpen(true); load() }}
        className="relative h-9 w-9 rounded-lg border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.04] transition-colors"
        title="Notifications">
        <span className="material-symbols-outlined text-[#dcc1ae]" style={{ fontSize: '19px' }}>notifications</span>
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#ff8f00] text-[#1B1F2A] text-[10px] font-bold flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && createPortal((
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start justify-end p-4"
          onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md mt-14 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-headline text-[15px] font-semibold text-[#e2e2e8]">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread.length > 0 && (
                  <button className="text-[11px] text-[#ffb87b] font-semibold uppercase hover:underline"
                    onClick={markAllRead}>Mark all read</button>
                )}
                <button className="text-[#dcc1ae] hover:text-white" onClick={() => setOpen(false)}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>
            </div>

            <div className="flex gap-1 px-4 py-2 border-b border-white/[0.06]">
              {(['unread', 'all'] as const).map(k => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-2.5 py-1 rounded text-[12px] font-semibold ${
                    tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b]' : 'text-[#dcc1ae] hover:bg-white/[0.03]'}`}>
                  {k === 'unread' ? `Unread (${unread.length})` : `All (${rows.length})`}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {shown.map(n => (
                <button key={n.id} onClick={() => markRead(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors flex gap-3 ${
                    !n.is_read ? 'bg-[#ff8f00]/[0.04]' : ''}`}>
                  <span className={`material-symbols-outlined ${TYPE_COLOR[n.type ?? 'info'] ?? 'text-[#dcc1ae]'}`}
                    style={{ fontSize: '18px', marginTop: 1 }}>
                    {TYPE_ICON[n.type ?? 'info'] ?? 'info'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] ${!n.is_read ? 'font-semibold text-[#e2e2e8]' : 'text-[#dcc1ae]'}`}>
                      {n.title}
                    </div>
                    {n.body && <div className="text-[12px] text-[#dcc1ae]/70 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-[#dcc1ae]/40 mt-1">{ago(n.created_at)}</div>
                  </div>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-[#ff8f00] mt-1.5 shrink-0" />}
                </button>
              ))}
              {!shown.length && (
                <div className="px-4 py-10 text-center text-[13px] text-[#dcc1ae]/50">
                  {tab === 'unread' ? 'Nothing unread.' : 'No notifications yet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}