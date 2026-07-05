/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        headline: ['"Archivo Narrow"', 'system-ui', 'sans-serif'],
      },
      colors: {
        'surface': '#111317',
        'surface-container-lowest': '#0c0e12',
        'surface-container-low': '#1a1c20',
        'surface-container': '#1e2024',
        'surface-container-high': '#282a2e',
        'surface-container-highest': '#333539',
        'on-surface': '#e2e2e8',
        'on-surface-variant': '#dcc1ae',
        'primary': '#ffb87b',
        'primary-container': '#ff8f00',
        'background': '#111317',
        'tertiary': '#bec6e6',
        'error': '#ffb4ab',
        'error-container': '#93000a',
        ink: '#0f1115',
        panel: '#1e2024',
        card: '#1b1f2a',
        line: 'rgba(255,255,255,0.08)',
        brand: '#ff8f00',
        brandd: '#e07f00',
        muted: '#8b90a0',
        faint: '#5b6070',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
        full: '9999px',
      },
    }
  },
  plugins: []
}