'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SchedulePicker, toLocalISOString } from '@/components/SchedulePicker'
import { ContactSearch } from '@/components/ContactSearch'
import { Contact, SendType } from '@/types'

interface Message {
    id: string
    contact_jid: string
    message?: string
    files?: { name: string; type: string; url: string }[]
    send_type: string
    scheduled_at: string
    sent: boolean
    created_at: string
    batch_id?: string
}

const getStatus = (msg: Message) => {
    if (msg.sent) return { label: '✓ Enviado', color: 'var(--success)', bg: '#f0faf5', border: 'var(--success)' }
    const scheduled = new Date(msg.scheduled_at)
    if (scheduled <= new Date()) return { label: '⟳ Enviando...', color: 'var(--warning)', bg: '#fff8ec', border: 'var(--warning)' }
    return { label: '⏳ Agendado', color: 'var(--purple)', bg: 'var(--purple-dim)', border: 'var(--purple-light)' }
}

const formatDate = (iso: string) => {
    const raw = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z'
    return new Date(raw).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    })
}

export default function HistoricoPage() {
    const [messages, setMessages] = useState<Message[]>([])
    const [filter, setFilter] = useState<'all' | 'sent' | 'pending'>('all')
    const [loading, setLoading] = useState(true)
    const [editingMsg, setEditingMsg] = useState<Message | null>(null)
    const [editMessage, setEditMessage] = useState('')
    const [editDate, setEditDate] = useState<Date>(new Date())
    const [editContact, setEditContact] = useState<Contact | null>(null)
    const [editSendType, setEditSendType] = useState<SendType>('text')
    const [editFiles, setEditFiles] = useState<File[]>([])
    const [saving, setSaving] = useState(false)
    const userIdRef = useRef<string | null>(null)

    const load = useCallback(async (userId?: string) => {
        const uid = userId ?? userIdRef.current
        if (!uid) return
        setLoading(true)

        let query = supabase
            .from('scheduled_messages')
            .select('*')
            .eq('user_id', uid)
            .order('scheduled_at', { ascending: false })
            .limit(100)

        if (filter === 'sent') query = query.eq('sent', true)
        if (filter === 'pending') query = query.eq('sent', false)

        const { data } = await query
        setMessages(data ?? [])
        setLoading(false)
    }, [filter])

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            userIdRef.current = user.id
            await load(user.id)

            channel = supabase
                .channel('scheduled_messages_changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'scheduled_messages',
                        filter: `user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        if (payload.eventType === 'DELETE') {
                            setMessages(prev => prev.filter(m => m.id !== payload.old.id))
                        } else if (payload.eventType === 'INSERT') {
                            setMessages(prev => [payload.new as Message, ...prev])
                        } else if (payload.eventType === 'UPDATE') {
                            setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new as Message : m))
                        }
                    }
                )
                .subscribe()
        }

        init()
        return () => { channel && supabase.removeChannel(channel) }
    }, [load])

    const openEdit = (msg: Message) => {
        setEditingMsg(msg)
        setEditMessage(msg.message || '')
        setEditDate(new Date(msg.scheduled_at))
        setEditSendType(msg.send_type as SendType)
        setEditFiles([])
        setEditContact(null)
    }

    const closeEdit = () => {
        setEditingMsg(null)
        setEditMessage('')
        setEditDate(new Date())
        setEditContact(null)
        setEditSendType('text')
        setEditFiles([])
    }

    const getFileType = (file: File): string => {
        const mime = file.type
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (mime.startsWith('image/')) return 'image'
        if (mime.startsWith('audio/')) return 'audio'
        if (mime.startsWith('video/')) return 'video'
        if (mime.includes('pdf')) return 'pdf'
        if (ext === 'pptx' || ext === 'ppt') return 'pptx'
        if (ext === 'docx' || ext === 'doc') return 'docx'
        if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
        return 'document'
    }

    const uploadFile = async (file: File): Promise<{ url: string; type: string; name: string }> => {
        const path = `uploads/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from('message-files')
            .upload(path, file, { contentType: file.type })
        if (error) throw new Error('Upload falhou: ' + error.message)
        const { data } = supabase.storage.from('message-files').getPublicUrl(path)
        return { url: data.publicUrl, type: getFileType(file), name: file.name }
    }

    const updateMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingMsg) return

        if (editSendType === 'text' && !editMessage.trim()) return alert('Digite uma mensagem')
        if (editSendType === 'file' && editFiles.length === 0 && !editingMsg.files?.length) return alert('Selecione pelo menos um arquivo')
        if (editSendType === 'both' && !editMessage.trim()) return alert('Digite uma mensagem')

        setSaving(true)
        try {
            let uploadedFiles = editingMsg.files ?? []
            if (editFiles.length > 0) {
                uploadedFiles = await Promise.all(editFiles.map(uploadFile))
            }

            const updates: Record<string, unknown> = {
                scheduled_at: toLocalISOString(editDate),
                send_type: editSendType,
                sent: false,
            }

            if (editContact) {
                updates.contact_jid = editContact.jid
            }

            if (editSendType !== 'file') {
                updates.message = editMessage
            } else {
                updates.message = null
            }

            if (editSendType !== 'text' && uploadedFiles.length > 0) {
                updates.files = uploadedFiles
            } else if (editSendType === 'text') {
                updates.files = null
            }

            const { error } = await supabase
                .from('scheduled_messages')
                .update(updates)
                .eq('id', editingMsg.id)

            if (error) throw error
            closeEdit()
        } catch (err: unknown) {
            alert('Erro ao salvar: ' + (err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const deleteMessage = async (id: string, batch_id?: string) => {
        if (!confirm('Deseja remover esta mensagem?')) return
        try {
            if (batch_id) {
                const { error } = await supabase.from('scheduled_messages').delete().eq('batch_id', batch_id)
                if (!error) {
                    setMessages(prev => prev.filter(m => m.batch_id !== batch_id))
                }
            } else {
                const { error } = await supabase.from('scheduled_messages').delete().eq('id', id)
                if (!error) {
                    setMessages(prev => prev.filter(m => m.id !== id))
                }
            }
        } catch (err: unknown) {
            alert('Erro ao remover: ' + (err as Error).message)
        }
    }

    const filteredMessages = messages.filter(msg => {
        if (filter === 'sent') return msg.sent
        if (filter === 'pending') return !msg.sent
        return true
    })

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>
            <div style={{
                marginBottom: '28px', display: 'flex', alignItems: 'flex-end',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px',
            }}>
                <div>
                    <h1 style={{ fontSize: '30px', color: 'var(--purple-dark)', marginBottom: '4px' }}>
                        Histórico
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        {filteredMessages.length} mensagem(ns) • atualização em tempo real
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'sent', 'pending'] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                            background: filter === f ? 'var(--purple)' : 'var(--surface)',
                            color: filter === f ? '#fff' : 'var(--text-muted)',
                            border: `1px solid ${filter === f ? 'var(--purple)' : 'var(--border)'}`,
                        }}>
                            {{ all: 'Todos', sent: 'Enviados', pending: 'Agendados' }[f]}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    Carregando...
                </p>
            ) : filteredMessages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    Nenhuma mensagem encontrada.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredMessages.map((msg) => {
                        const status = getStatus(msg)
                        return (
                            <div key={msg.id} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow)',
                                borderLeft: `4px solid ${status.border}`,
                            }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    marginBottom: '8px', gap: '8px', flexWrap: 'wrap',
                                }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        📅 {formatDate(msg.scheduled_at)}
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: status.color }}>
                                        {status.label}
                                    </span>
                                </div>

                                {msg.message && (
                                    <p style={{
                                        fontSize: '14px', color: 'var(--text)',
                                        marginBottom: '10px', lineHeight: 1.5,
                                    }}>
                                        {msg.message}
                                    </p>
                                )}

                                {msg.files && msg.files.length > 0 && (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                        📎 {msg.files.length} arquivo(s)
                                    </p>
                                )}

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => openEdit(msg)}
                                        style={{
                                            padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                            cursor: 'pointer', background: 'var(--purple-dim)',
                                            color: 'var(--purple)', border: '1px solid var(--purple-light)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        ✏️ Editar{msg.sent ? ' & Reenviar' : ''}
                                    </button>

                                    <button
                                        onClick={() => deleteMessage(msg.id, msg.batch_id)}
                                        style={{
                                            padding: '6px 14px', fontSize: '12px', borderRadius: '6px',
                                            cursor: 'pointer', background: '#fff0f0',
                                            color: 'var(--danger)', border: '1px solid var(--danger)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        🗑️ Remover{msg.batch_id ? ' lote' : ''}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {editingMsg && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.55)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '16px', zIndex: 1000, overflowY: 'auto',
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeEdit() }}
                >
                    <form
                        onSubmit={updateMessage}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'var(--surface)', padding: '28px',
                            borderRadius: '16px', width: '100%', maxWidth: '520px',
                            display: 'flex', flexDirection: 'column', gap: '18px',
                            boxShadow: 'var(--shadow-lg)',
                            margin: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', color: 'var(--purple-dark)' }}>
                                    Editar agendamento
                                </h2>
                                {editingMsg.sent && (
                                    <p style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '4px' }}>
                                        ⚠️ Será reenviada no horário escolhido
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={closeEdit}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '22px', color: 'var(--text-muted)', lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div>
                            <label style={labelStyle}>Grupo destinatário</label>
                            <ContactSearch
                                selected={editContact}
                                onSelect={setEditContact}
                                placeholder={`Atual: ${editingMsg.contact_jid}`}
                            />
                            {!editContact && (
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Deixe em branco para manter o grupo atual
                                </p>
                            )}
                        </div>

                        <div>
                            <label style={labelStyle}>Tipo de envio</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(['text', 'file', 'both'] as SendType[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setEditSendType(t)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                                            fontWeight: 600, fontSize: '12px', transition: 'all 0.2s',
                                            background: editSendType === t ? 'var(--purple)' : 'var(--surface-2)',
                                            color: editSendType === t ? '#fff' : 'var(--text-muted)',
                                            border: `1px solid ${editSendType === t ? 'var(--purple)' : 'var(--border)'}`,
                                        }}
                                    >
                                        {{ text: '💬 Texto', file: '📎 Arquivo', both: '✉️ Ambos' }[t]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(editSendType === 'text' || editSendType === 'both') && (
                            <div>
                                <label style={labelStyle}>Mensagem</label>
                                <textarea
                                    value={editMessage}
                                    onChange={e => setEditMessage(e.target.value)}
                                    rows={4}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                                        color: 'var(--text)', fontSize: '14px',
                                        resize: 'vertical', outline: 'none',
                                    }}
                                />
                            </div>
                        )}

                        {(editSendType === 'file' || editSendType === 'both') && (
                            <div>
                                <label style={labelStyle}>
                                    Arquivos {editFiles.length > 0 ? `(${editFiles.length} novo(s))` : editingMsg.files?.length ? `(${editingMsg.files.length} atual(is))` : ''}
                                </label>
                                {editingMsg.files && editingMsg.files.length > 0 && editFiles.length === 0 && (
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                        Arquivos atuais serão mantidos. Selecione novos para substituir.
                                    </p>
                                )}
                                <label style={{
                                    display: 'block', border: '2px dashed var(--purple-light)',
                                    borderRadius: '10px', padding: '14px', textAlign: 'center',
                                    cursor: 'pointer', background: 'var(--purple-dim)',
                                }}>
                                    <input
                                        key={editFiles.length}
                                        type="file"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.files ?? [])
                                            if (selected.length > 0) setEditFiles(prev => [...prev, ...selected])
                                            e.target.value = ''
                                        }}
                                    />
                                    <p style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '13px' }}>
                                        Clique para selecionar arquivos
                                    </p>
                                </label>
                                {editFiles.length > 0 && (
                                    <ul style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {editFiles.map((f, i) => (
                                            <li key={`${f.name}-${i}`} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                background: 'var(--surface-2)', borderRadius: '6px',
                                                padding: '6px 12px', fontSize: '12px',
                                            }}>
                                                <span>📄 {f.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditFiles(prev => prev.filter((_, j) => j !== i))}
                                                    style={{
                                                        color: 'var(--danger)', background: 'none',
                                                        border: 'none', cursor: 'pointer', fontSize: '11px',
                                                    }}
                                                >
                                                    remover
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>Data e hora</label>
                            <SchedulePicker value={editDate} onChange={setEditDate} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                                    background: saving ? 'var(--purple-light)' : 'var(--purple)',
                                    color: '#fff', fontWeight: 700, fontSize: '14px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {saving ? 'Salvando...' : editingMsg.sent ? 'Salvar & Reenviar' : 'Salvar'}
                            </button>
                            <button
                                type="button"
                                onClick={closeEdit}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '8px',
                                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                                    color: 'var(--text-muted)', fontWeight: 600,
                                    fontSize: '14px', cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '6px',
    textTransform: 'uppercase', letterSpacing: '0.06em',
}