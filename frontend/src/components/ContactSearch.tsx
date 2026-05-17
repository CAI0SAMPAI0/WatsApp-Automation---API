'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Contact } from '@/types'

interface Props {
    onSelect: (contact: Contact | null) => void
    selected?: Contact | null
    placeholder?: string
}

export const ContactSearch = ({ onSelect, selected, placeholder }: Props) => {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Contact[]>([])
    const [loading, setLoading] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setUserId(data.user.id)
        })
    }, [])

    const search = async (value: string) => {
        setQuery(value)
        if (value.length < 2 || !userId) { setResults([]); return }
        setLoading(true)

        const { data, error } = await supabase
            .from('groups')
            .select('*')
            .eq('user_id', userId)
            .ilike('subject', `%${value}%`)
            .limit(10)

        if (!error && data) {
            setResults(data.map((g: any) => ({
                id: String(g.id),
                name: g.subject,
                jid: g.jid,
                type: 'group' as const,
                created_at: g.created_at,
            })))
        }
        setLoading(false)
    }

    const defaultPlaceholder = placeholder ?? 'Buscar grupo...'

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <input
                type="text"
                value={selected ? selected.name : query}
                onChange={(e) => { if (selected) onSelect(null); search(e.target.value) }}
                placeholder={defaultPlaceholder}
                style={inputStyle}
            />
            {loading && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Buscando...</p>
            )}
            {results.length > 0 && !selected && (
                <ul style={{
                    position: 'absolute', zIndex: 50, width: '100%',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '12px', marginTop: '4px',
                    boxShadow: 'var(--shadow-lg)', maxHeight: '240px', overflowY: 'auto',
                }}>
                    {results.map((c) => (
                        <li
                            key={c.jid}
                            onClick={() => { onSelect(c); setResults([]); setQuery('') }}
                            style={{
                                padding: '10px 16px', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--purple-dim)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                                background: 'var(--teal)', color: '#fff', fontWeight: 600,
                            }}>
                                Grupo
                            </span>
                            <span style={{ fontSize: '14px' }}>{c.name}</span>
                        </li>
                    ))}
                </ul>
            )}
            {selected && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        background: 'var(--teal)', color: '#fff', fontWeight: 600,
                    }}>
                        Grupo
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{selected.name}</span>
                    <button
                        onClick={() => { onSelect(null); setQuery('') }}
                        style={{
                            marginLeft: 'auto', fontSize: '12px', color: 'var(--danger)',
                            background: 'none', border: 'none', cursor: 'pointer',
                        }}
                    >
                        remover
                    </button>
                </div>
            )}
        </div>
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '11px 16px', color: 'var(--text)',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
    boxShadow: '0 1px 4px rgba(123,94,167,0.06)',
}