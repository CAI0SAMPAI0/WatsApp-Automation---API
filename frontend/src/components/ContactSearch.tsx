'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Contact } from '@/types'

interface Props {
  onSelect: (contact: Contact | null) => void
  selected?: Contact | null
}

export const ContactSearch = ({ onSelect, selected }: Props) => {
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
    if (value.length < 2 || !userId) {
      setResults([])
      return
    }

    setLoading(true)

    try {
      // 1. Buscar Contatos Individuais
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${value}%`)
        .limit(10)

      // 2. Buscar Grupos
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .eq('user_id', userId)
        .ilike('subject', `%${value}%`)
        .limit(10)

      // 3. Unir e formatar os dados
      const formattedContacts = (contactsData || []).map(c => ({
        ...c,
        type: 'individual' as const,
        name: c.name || c.notify || c.jid
      }))

      const formattedGroups = (groupsData || []).map(g => ({
        jid: g.jid,
        name: g.subject || g.name || 'Grupo sem nome',
        user_id: g.user_id,
        type: 'group' as const,
        // Mapeia outros campos se necessário no seu tipo Contact
        id: g.id
      }))

      const allResults = [...formattedContacts, ...formattedGroups]

      if (!contactsError && !groupsError) {
        setResults(allResults)
      } else {
        console.error('Erro na busca:', contactsError || groupsError)
      }
    } catch (err) {
      console.error('Erro inesperado:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={selected ? selected.name : query}
        onChange={(e) => {
          if (selected) onSelect(null)
          search(e.target.value)
        }}
        placeholder="Buscar contato ou grupo..."
        style={inputStyle}
        className="w-full"
      />
      {loading && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Buscando...
        </p>
      )}
      {results.length > 0 && !selected && (
        <ul style={{
          position: 'absolute', zIndex: 50, width: '100%',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', marginTop: '4px',
          boxShadow: 'var(--shadow-lg)', maxHeight: '240px', overflowY: 'auto',
        }}>
          {results.map((c) => (
            <li key={c.jid} onClick={() => { onSelect(c); setResults([]); setQuery('') }}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--purple-dim)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                background: c.type === 'group' ? 'var(--teal)' : 'var(--purple-light)',
                color: c.type === 'group' ? '#fff' : 'var(--purple-dark)',
                fontWeight: 600,
              }}>
                {c.type === 'group' ? 'Grupo' : 'Contato'}
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
            background: selected.type === 'group' ? 'var(--teal)' : 'var(--purple-light)',
            color: selected.type === 'group' ? '#fff' : 'var(--purple-dark)',
            fontWeight: 600,
          }}>
            {selected.type === 'group' ? 'Grupo' : 'Contato'}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{selected.name}</span>
          <button onClick={() => { onSelect(null); setQuery('') }}
            style={{
              marginLeft: 'auto', fontSize: '12px', color: 'var(--danger)',
              background: 'none', border: 'none', cursor: 'pointer'
            }}>
            remover
          </button>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '11px 16px',
  color: 'var(--text)',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxShadow: '0 1px 4px rgba(123,94,167,0.06)',
}