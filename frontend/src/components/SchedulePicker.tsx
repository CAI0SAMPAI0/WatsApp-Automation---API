'use client'

import { useEffect, useState } from 'react'

interface Props {
    value: Date
    onChange: (date: Date) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const toTimeStr = (d: Date) =>
    `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Retorna new Date() local + 2 minutos, segundos zerados
const nowPlus2 = (): Date => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 2)
    d.setSeconds(0, 0)
    return d
}

export const SchedulePicker = ({ value, onChange }: Props) => {
    // Evita hydration mismatch: só renderiza inputs no cliente
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [y, m, d] = e.target.value.split('-').map(Number)
        const next = new Date(value)
        next.setFullYear(y, m - 1, d)
        onChange(next)
    }

    const handleTime = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [h, min] = e.target.value.split(':').map(Number)
        const next = new Date(value)
        next.setHours(h, min, 0, 0)
        onChange(next)
    }

    if (!mounted) {
        return <div style={{ height: '88px', background: 'var(--surface-2)', borderRadius: '10px', opacity: 0.4 }} />
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
                type="button"
                onClick={() => onChange(nowPlus2())}
                style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px', borderRadius: '8px', cursor: 'pointer',
                    fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                }}
            >
                ⚡ Agora (+2 min)
            </button>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                    <label style={labelStyle}>Data</label>
                    <input
                        type="date"
                        value={toDateStr(value)}
                        onChange={handleDate}
                        style={inputStyle}
                    />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                    <label style={labelStyle}>Horário</label>
                    <input
                        type="time"
                        value={toTimeStr(value)}
                        onChange={handleTime}
                        style={inputStyle}
                    />
                </div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-4px' }}>
                🕐 Agendado para:{' '}
                <strong style={{ color: 'var(--purple)' }}>
                    {value.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    })}
                </strong>
            </p>
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '5px',
    textTransform: 'uppercase', letterSpacing: '0.06em',
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '11px 14px', color: 'var(--text)',
    fontSize: '14px', outline: 'none',
    boxShadow: '0 1px 4px rgba(123,94,167,0.06)',
}