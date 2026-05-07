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
        if (m === 'now') onChange(new Date(Date.now() + 5000))
    }

    const toLocalInput = (date: Date) => {
        const offset = date.getTimezoneOffset() * 60000
        return new Date(date.getTime() - offset).toISOString().slice(0, 16)
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
                {(['now', 'custom'] as const).map((m) => (
                    <button key={m} onClick={() => handleMode(m)} style={{
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
                    onChange={(e) => onChange(new Date(e.target.value))}
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