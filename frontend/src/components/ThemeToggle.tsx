'use client'

import { useEffect, useState } from 'react'

export const ThemeToggle = () => {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') { setDark(true); document.documentElement.setAttribute('data-theme', 'dark') }
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button onClick={toggle} style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '7px 12px', cursor: 'pointer',
      fontSize: '16px', transition: 'all 0.2s', lineHeight: 1,
    }} title={dark ? 'Modo claro' : 'Modo escuro'}>
      {dark ? '☀️' : '🌙'}
    </button>
  )
}