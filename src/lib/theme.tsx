import { createContext, useContext, useEffect, useState } from 'react'

// ============================================================
// Theme — dark / light, driven by the CSS variables in index.css.
// Flips a data-theme attribute on <html>, remembers the choice,
// and falls back to the OS preference on first visit.
// ============================================================

type Theme = 'dark' | 'light'
type Ctx = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }

const ThemeContext = createContext<Ctx>({ theme: 'dark', toggle: () => {}, setTheme: () => {} })

function initialTheme(): Theme {
  return 'light'
}
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    try { localStorage.setItem('aadvik-theme', theme) } catch { /* ignore */ }
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}

// A small, self-contained toggle button (icon flips with the theme).
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--text-2)] transition-colors ${className}`}
    >
    <span className="material-symbols-outlined" style={{ fontSize: '18px', fontFamily: "'Material Symbols Outlined'" }}>
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}