import { Link, useNavigate } from 'react-router-dom'
import SiteChrome from './SiteChrome'
import { useState } from 'react'

type Status = 'ongoing' | 'completed'
type Project = { title: string; location: string; client: string; status: Status; progress: number }

const PROJECTS: Project[] = [
  { title: 'NALCO Damanjodi Railway Siding', location: 'Damanjodi, Odisha', client: 'NALCO · under RITES', status: 'ongoing', progress: 62 },
  { title: 'Delta Water Works', location: 'Ahmedabad, Gujarat', client: 'Municipal Corporation', status: 'ongoing', progress: 42 },
  { title: 'Interstate Highway X-20', location: 'Navi Mumbai, Maharashtra', client: 'NHAI', status: 'ongoing', progress: 75 },
  { title: 'Skyline Tech Park', location: 'Pune, Maharashtra', client: 'Global Tech Infra', status: 'completed', progress: 100 },
  { title: 'Sector-V Flyover', location: 'Bengaluru, Karnataka', client: 'BDA', status: 'completed', progress: 100 },
  { title: 'Logistics Hub B-4', location: 'Hyderabad, Telangana', client: 'National Logistics', status: 'ongoing', progress: 15 },
]

const FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: 'All Projects' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
]

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | Status>('all')
  const list = PROJECTS.filter(p => filter === 'all' || p.status === filter)

  return (
    <SiteChrome>
      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-24 pb-12">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-4">Engineering Excellence</div>
        <h1 className="display text-[clamp(2.4rem,6vw,5rem)] text-[var(--text)] mb-6">Project portfolio</h1>
        <p className="text-[16px] leading-relaxed text-[var(--text-2)] max-w-[44rem]">
          A definitive overview of our ongoing and completed civil infrastructure developments, reflecting technical
          precision and structural integrity.
        </p>

        {/* Filter tabs */}
        <div className="mt-10 flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors border ${
                filter === f.key
                  ? 'bg-[var(--text)] text-[var(--bg)] border-[var(--text)]'
                  : 'text-[var(--text-2)] border-[var(--line)] hover:border-[var(--text-2)] hover:text-[var(--text)]'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pb-16 lg:pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(p => (
            <article key={p.title} className="group rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 flex flex-col hover:border-[var(--accent)]/50 transition-colors">
              <div className="flex items-center justify-between mb-5">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full ${
                  p.status === 'ongoing'
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-emerald-500 bg-emerald-500/10'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'ongoing' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {p.status}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-2)] group-hover:text-[var(--accent)] transition-colors">
                  View Details <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform" style={{ fontSize: '15px' }}>arrow_forward</span>
                </span>
              </div>

              <h3 className="text-[18px] font-semibold text-[var(--text)] leading-snug mb-3">{p.title}</h3>
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-2)] mb-1">
                <span className="material-symbols-outlined text-[var(--faint)]" style={{ fontSize: '16px' }}>location_on</span>
                {p.location}
              </div>
              <div className="text-[13px] text-[var(--text-2)] mb-6">Client: {p.client}</div>

              <div className="mt-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--faint)] font-mono">
                    {p.status === 'completed' ? 'Finished' : 'Progress'}
                  </span>
                  {p.status === 'ongoing' && <span className="font-mono text-[12px] text-[var(--accent)]">{p.progress}%</span>}
                </div>
                <div className="h-1.5 rounded-full bg-[var(--card-2)] overflow-hidden">
                  <div className={`h-full rounded-full ${p.status === 'completed' ? 'bg-emerald-500' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-24 text-center">
          <h2 className="display text-[clamp(2rem,5vw,3.6rem)] text-[var(--ink-fg)] max-w-[16ch] mx-auto mb-6">Build the future with us.</h2>
          <p className="text-[15px] text-[var(--ink-fg)]/60 max-w-[40rem] mx-auto mb-10">
            Interested in partnering with AADVIK for your next large-scale infrastructure project? Let's discuss your requirements.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="mailto:contact@aadvik.example" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--ink-fg)] hover:opacity-90 px-8 py-4 rounded-full transition-opacity">
              Get a Quote <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </a>
            <button onClick={() => navigate('/about')} className="inline-flex items-center text-[14px] font-semibold text-[var(--ink-fg)] border border-white/[0.2] hover:border-white/[0.4] px-8 py-4 rounded-full transition-colors">
              View Capabilities
            </button>
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}