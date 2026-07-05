import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../../lib/theme'
import { useState } from 'react'

// Shared nav + footer for all marketing pages.
const NAV = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Projects', to: '/projects' },
  { label: 'Growth', to: '/growth' },
  { label: 'Contact', to: '/contact' },
]

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)

  return (
    <div className="page-lines min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased overflow-x-hidden">
      <style>{`html{scroll-behavior:smooth}`}</style>

      {/* Nav */}
      <header className="sticky top-0 z-40 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
            <span className="text-[15px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-8 text-[13px]">
            {NAV.map(n => (
              <Link key={n.to} to={n.to}
                className={`transition-colors ${pathname === n.to ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-2)] hover:text-[var(--text)]'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
           <Link to="/contact" className="hidden sm:inline text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--card-2)] px-3 py-2 rounded-full transition-colors">Get a Quote</Link>
            <button onClick={() => navigate('/login')} className="text-[13px] font-bold text-[var(--bg)] bg-[var(--text)] hover:opacity-90 px-5 py-2.5 rounded-full transition-opacity">Employee Login</button>
            <button className="lg:hidden text-[var(--text)]" onClick={() => setMenu(v => !v)}>
              <span className="material-symbols-outlined">{menu ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
        {menu && (
          <div className="lg:hidden border-t border-[var(--line)] px-6 py-4 flex flex-col gap-3 bg-[var(--bg)]">
            {NAV.map(n => (
              <Link key={n.to} to={n.to} onClick={() => setMenu(false)}
                className={`text-[14px] ${pathname === n.to ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-2)]'}`}>
                {n.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {children}

      {/* Footer */}
      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-12 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-[9px] h-[9px] bg-[var(--accent)] rounded-[2px]" />
              <span className="text-[15px] font-bold tracking-[0.16em] text-[var(--text)]">AADVIK</span>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--text-2)] max-w-[24rem]">
              Civil construction and infrastructure — building the backbone of modern India through
              engineering precision and industrial-grade safety.
            </p>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono mb-4">Company</div>
            <div className="flex flex-col gap-2.5 text-[13px] text-[var(--text-2)]">
              {NAV.map(n => <Link key={n.to} to={n.to} className="hover:text-[var(--text)] transition-colors w-fit">{n.label}</Link>)}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] font-mono mb-4">Get in touch</div>
            <a href="mailto:contact@aadvik.example" className="text-[13px] text-[var(--text-2)] hover:text-[var(--text)] transition-colors block mb-2">contact@aadvik.example</a>
            <button onClick={() => navigate('/login')} className="text-[13px] font-semibold text-[var(--accent)] hover:underline">Employee Login →</button>
          </div>
        </div>
        <div className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-[1200px] px-6 lg:px-8 py-5 text-[12px] text-[var(--faint)]">
            © {new Date().getFullYear()} Aadvik AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

/* flat CSS-isometric cube */
export function Cube({ size = 100, faces }: { size?: number; faces: string[] }) {
  const [top, right, left] = faces
  return (
    <svg width={size} height={size * 1.16} viewBox="0 0 100 116" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.28))' }}>
      <polygon points="50,0 100,29 50,58 0,29" fill={top} />
      <polygon points="100,29 100,87 50,116 50,58" fill={right} />
      <polygon points="0,29 50,58 50,116 0,87" fill={left} />
    </svg>
  )
}