import { Link, useNavigate } from 'react-router-dom'
import SiteChrome from './SiteChrome'
import { IMAGES } from '../../lib/images'

const STATS = [
  { value: '15+', label: 'Years in Business' },
  { value: '120+', label: 'Projects Delivered' },
  { value: '₹500 Cr+', label: 'Works Executed' },
  { value: '40+', label: 'Institutional Clients' },
]

const SERVICES = [
  { icon: 'add_road', title: 'Roads & Highways', body: 'National connectivity built on high-durability pavements, drainage and smart traffic integration.' },
  { icon: 'architecture', title: 'Bridges & Flyovers', body: 'Structural marvels engineered with advanced cantilever, girder and seismic-resistant techniques.' },
  { icon: 'train', title: 'Railway Sidings', body: 'Heavy-haul railway earthworks, track linking and siding infrastructure for industrial hubs.' },
  { icon: 'domain', title: 'Urban Development', body: 'Resilient city centres, drainage systems, water works and mixed-use commercial hubs.' },
]

const PROJECTS = [
  { tag: 'Railway • 2024', title: 'NALCO Damanjodi Railway Siding', body: 'A ₹33.55 Cr railway-siding package delivering heavy earthworks, track linking and allied civil works.', img: IMAGES.nalcoSiding },
  { tag: 'Urban • 2024', title: 'Delta Water Works', body: 'Industrial water treatment and distribution infrastructure with polished steel pipelines and reservoirs.', img: IMAGES.deltaWater },
  { tag: 'Highway • 2023', title: 'Interstate Highway X-20', body: 'A 120 km arterial highway connecting two industrial corridors with zero-maintenance surfacing.', img: IMAGES.highwayX20 },
]

const CLIENTS = [
  { icon: 'token', name: 'NALCO' },
  { icon: 'factory', name: 'RITES' },
  { icon: 'location_city', name: 'NHAI' },
  { icon: 'construction', name: 'PWD' },
  { icon: 'foundation', name: 'RVNL' },
  { icon: 'corporate_fare', name: 'OMC' },
]

export default function Home() {
  const navigate = useNavigate()
  return (
    <SiteChrome>
      {/* Hero */}
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-8 pt-16 lg:pt-20 pb-8">
        <div className="max-w-[52rem]">
          <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-[var(--line)] text-[11px] tracking-[0.16em] uppercase text-[var(--text-2)] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Established 2009
          </div>
          <h1 className="display text-[clamp(2.8rem,8vw,6.5rem)] text-[var(--text)]">
            Building infrastructure that lasts.
          </h1>
          <p className="mt-8 text-[16px] leading-relaxed text-[var(--text-2)] max-w-[40rem]">
            AADVIK is a civil construction and infrastructure firm dedicated to building the backbone of modern India.
            We deliver structural excellence through technical precision, unwavering integrity, and industrial-grade safety.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/projects" className="inline-flex items-center gap-2 text-[14px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-7 py-3.5 rounded-full transition-opacity">
              Our Projects <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </Link>
            <a href="mailto:contact@aadvik.example" className="inline-flex items-center text-[14px] font-semibold text-[var(--text)] border border-[var(--line)] hover:border-[var(--text-2)] px-7 py-3.5 rounded-full transition-colors">
              Get a Quote
            </a>
          </div>
        </div>
      </section>

      {/* Cinematic hero image band */}
      <section className="mx-auto max-w-[1320px] px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="group relative rounded-[28px] overflow-hidden border border-[var(--line)] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)] h-[380px] sm:h-[460px] lg:h-[560px]">
          <img src={IMAGES.heroSite} alt="AADVIK infrastructure site"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[1200ms] ease-out" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />

          {/* caption bottom-left */}
          <div className="absolute left-6 lg:left-10 bottom-6 lg:bottom-10 right-6">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-mono tracking-[0.24em] uppercase text-white/90">Live Project</span>
            </div>
            <div className="display text-[clamp(1.6rem,3.5vw,2.8rem)] text-white leading-none">NALCO Damanjodi Railway Siding</div>
            <div className="text-[14px] text-white/80 mt-3 font-mono tracking-wide">₹33.55 Cr · under RITES · Damanjodi, Odisha</div>
          </div>

          {/* stat chips top-right */}
          <div className="absolute top-6 right-6 hidden md:flex flex-col gap-2 items-end">
            <Chip k="Contract" v="₹33.55 Cr" />
            <Chip k="Supervision" v="RITES" />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-14 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="display text-[clamp(1.8rem,3.5vw,2.8rem)] text-[var(--ink-fg)]">{s.value}</div>
              <div className="text-[12px] tracking-[0.16em] uppercase text-[var(--ink-fg)]/50 mt-1 font-mono">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who We Are */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
        <div>
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Who We Are</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)] max-w-[18ch] mb-6">We redefine the horizon</h2>
          <p className="text-[15px] leading-relaxed text-[var(--text-2)] max-w-[38rem]">
            With over a decade of expertise in civil engineering and large-scale infrastructure, we deliver structural
            integrity that stands the test of time — from railway sidings to highways and urban works.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FeatureCard icon="architecture" title="Technical Excellence" body="Modern methods and engineering precision in every structure." />
          <FeatureCard icon="health_and_safety" title="Safety First" body="A zero-incident culture driving operations across every site." />
        </div>
      </section>

      {/* Services */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Our Expertise</div>
          <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--ink-fg)] mb-12">Core infrastructure services</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map(s => (
              <div key={s.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                <span className="material-symbols-outlined text-[var(--accent)] mb-5" style={{ fontSize: '30px' }}>{s.icon}</span>
                <h3 className="text-[17px] font-semibold text-[var(--ink-fg)] mb-2">{s.title}</h3>
                <p className="text-[13px] leading-relaxed text-[var(--ink-fg)]/55">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 py-16 lg:py-24">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-3">Portfolio</div>
            <h2 className="display text-[clamp(1.8rem,4vw,3rem)] text-[var(--text)]">Landmark projects</h2>
          </div>
          <Link to="/projects" className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors">
            View All Projects <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>arrow_forward</span>
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PROJECTS.map(p => (
            <Link key={p.title} to="/projects" className="group rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden hover:border-[var(--accent)]/50 transition-colors">
              <div className="relative h-40 overflow-hidden">
                <img src={p.img} alt={p.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-6">
              <div className="text-[11px] font-mono tracking-[0.14em] uppercase text-[var(--accent)] mb-4">{p.tag}</div>
              <h3 className="text-[18px] font-semibold text-[var(--text)] mb-3 leading-snug">{p.title}</h3>
              <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{p.body}</p>
              <div className="mt-5 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-2)] group-hover:text-[var(--accent)] transition-colors">
                View details <span className="material-symbols-outlined group-hover:translate-x-0.5 transition-transform" style={{ fontSize: '15px' }}>arrow_forward</span>
              </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Clients */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center text-[11px] tracking-[0.3em] uppercase text-[var(--faint)] font-mono mb-8">Trusted by Industry Leaders</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CLIENTS.map(c => (
            <div key={c.name} className="h-20 rounded-2xl border border-[var(--line)] bg-[var(--card)] flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[var(--text-2)]" style={{ fontSize: '20px' }}>{c.icon}</span>
              <span className="text-[14px] font-bold tracking-wide text-[var(--text)]/80">{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto max-w-[1200px] px-6 lg:px-8 pb-16 lg:pb-24">
        <div className="text-[11px] tracking-[0.3em] uppercase text-[var(--accent)] font-mono mb-8">On the Ground</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[IMAGES.gallery1, IMAGES.gallery2, IMAGES.gallery3, IMAGES.gallery4].map((g, i) => (
            <div key={i} className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--line)]">
              <img src={g} alt="AADVIK site" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--ink)] text-[var(--ink-fg)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-20 lg:py-24 text-center">
          <h2 className="display text-[clamp(2rem,5vw,3.6rem)] text-[var(--ink-fg)] max-w-[18ch] mx-auto mb-6">Ready to build your legacy?</h2>
          <p className="text-[15px] text-[var(--ink-fg)]/60 max-w-[40rem] mx-auto mb-10">
            Connect with our engineering team today for a detailed feasibility study and quotation for your next infrastructure project.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="mailto:contact@aadvik.example" className="inline-flex items-center gap-2 text-[14px] font-bold text-[#0B0B0C] bg-[#ECEBE6] hover:opacity-90 px-8 py-4 rounded-full transition-opacity">
              Request Proposal <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </a>
            <button onClick={() => navigate('/login')} className="inline-flex items-center text-[14px] font-semibold text-[#ECEBE6] border border-[#ffffff40] hover:border-[#ffffff80] px-8 py-4 rounded-full transition-colors">
              Contact Sales
            </button>
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-right">
      <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-white/60">{k}</div>
      <div className="text-[14px] font-semibold text-white">{v}</div>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
      <span className="material-symbols-outlined text-[var(--accent)] mb-4" style={{ fontSize: '26px' }}>{icon}</span>
      <h3 className="text-[16px] font-semibold text-[var(--text)] mb-2">{title}</h3>
      <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{body}</p>
    </div>
  )
}