'use client'

import { useState } from 'react'

interface Props {
    value: Date
    onChange: (date: Date) => void
}

export const SchedulePicker = ({ value, onChange }: Props) => {
    const [mode, setMode] = useState<'now' | 'custom'>('now')

    const handleMode = (m: 'now' | 'custom') => {
        setMode(m)
        if (m === 'now') onChange(new Date())
    }

    const toLocalInput = (date: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const local = e.target.value
        const date = new Date(local)
        onChange(date)
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
                {(['now', 'custom'] as const).map((m) => (
                    <button key={m} type='button' onClick={() => handleMode(m)} style={{
                        padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
                        fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                        background: mode === m ? 'var(--purple)' : 'var(--surface-2)',
                        color: mode === m ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${mode === m ? 'var(--purple)' : 'var(--border)'}`,
                    }}>
                        {m === 'now' ? '⚡ Enviar agora' : '🗓 Agendar'}
                    </button>
                ))}
            </div>
            {mode === 'custom' && (
                <input type="datetime-local" value={toLocalInput(value)}
                    onChange={handleChange}
                    style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '10px', padding: '11px 16px', color: 'var(--text)',
                        fontSize: '14px', outline: 'none',
                    }}
                />
            )}
        </div>
    )
}