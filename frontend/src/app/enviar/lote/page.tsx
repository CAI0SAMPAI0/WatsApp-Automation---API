'use client'

import { useState } from 'react'
import { ContactSearch } from '@/components/ContactSearch'
import { SchedulePicker, toLocalISOString, isScheduleValid } from '@/components/SchedulePicker'
import { supabase } from '@/lib/supabase'
import { Contact, SendType, MessageFile } from '@/types'

interface BatchItem {
    id: string
    contact: Contact | null
    sendType: SendType
    message: string
    files: File[]
}

const nowPlus5 = () => {
    const d = new Date()
    d.setSeconds(0, 0)
    d.setMinutes(d.getMinutes() + 5)
    return d
}

const newItem = (): BatchItem => ({
    id: crypto.randomUUID(),
    contact: null,
    sendType: 'text',
    message: '',
    files: [],
})

export default function LotePage() {
    const [items, setItems] = useState<BatchItem[]>([newItem()])
    const [scheduledAt, setScheduledAt] = useState<Date>(nowPlus5)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const update = (id: string, changes: Partial<BatchItem>) =>
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i))

    const remove = (id: string) =>
        setItems(prev => prev.filter(i => i.id !== id))

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

    const uploadFile = async (file: File): Promise<MessageFile> => {
        const path = `uploads/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from('message-files')
            .upload(path, file, { contentType: file.type })
        if (error) throw new Error('Upload falhou: ' + error.message)
        const { data } = supabase.storage.from('message-files').getPublicUrl(path)
        return { url: data.publicUrl, type: getFileType(file), name: file.name }
    }

    const handleFileChange = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (selected.length === 0) return
        setItems(prev => prev.map(i =>
            i.id === itemId ? { ...i, files: [...i.files, ...selected] } : i
        ))
    }

    const handleSubmit = async () => {
        for (const item of items) {
            if (!item.contact) return alert('Selecione um contato em todos os itens')
            if (item.sendType === 'text' && !item.message) return alert(`Digite uma mensagem para ${item.contact.name}`)
            if (item.sendType === 'file' && item.files.length === 0) return alert(`Selecione arquivo para ${item.contact.name}`)
            if (item.sendType === 'both' && (!item.message || item.files.length === 0)) return alert(`Preencha mensagem e arquivo para ${item.contact.name}`)
        }

        if (!isScheduleValid(scheduledAt)) return alert('O horário deve ser pelo menos 1 minuto no futuro')

        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const rows = await Promise.all(items.map(async (item) => {
                let uploadedFiles: MessageFile[] = []
                if (item.sendType !== 'text' && item.files.length > 0)
                    uploadedFiles = await Promise.all(item.files.map(uploadFile))

                return {
                    contact_jid: item.contact!.jid,
                    message: item.sendType !== 'file' ? item.message : undefined,
                    files: uploadedFiles.length > 0 ? uploadedFiles : null,
                    send_type: item.sendType,
                    scheduled_at: toLocalISOString(scheduledAt),
                    sent: false,
                    user_id: user.id,
                }
            }))

            const { error } = await supabase.from('scheduled_messages').insert(rows)
            if (error) throw error

            setSuccess(true)
            setItems([newItem()])
            setScheduledAt(nowPlus5())
            setTimeout(() => setSuccess(false), 4000)
        } catch (err: unknown) {
            alert('Erro: ' + (err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '32px', color: 'var(--purple-dark)', marginBottom: '4px' }}>
                    Envio em lote
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Adicione vários destinatários, cada um com sua própria mensagem e arquivos
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {items.map((item, index) => (
                    <div key={item.id} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '14px', padding: '20px',
                        boxShadow: '0 1px 6px rgba(123,94,167,0.06)',
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: '16px',
                        }}>
                            <span style={{
                                fontFamily: 'Playfair Display, serif', fontWeight: 700,
                                color: 'var(--purple)', fontSize: '15px',
                            }}>
                                Destinatário {index + 1}
                            </span>
                            {items.length > 1 && (
                                <button onClick={() => remove(item.id)} style={{
                                    color: 'var(--danger)', background: 'none', border: 'none',
                                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                                }}>
                                    remover
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Contato ou grupo</label>
                                <ContactSearch
                                    selected={item.contact}
                                    onSelect={(c) => update(item.id, { contact: c })}
                                />
                            </div>

                            <div>
                                <label style={labelStyle}>Tipo de envio</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {(['text', 'file', 'both'] as SendType[]).map((t) => (
                                        <button key={t} onClick={() => update(item.id, { sendType: t })} style={{
                                            padding: '7px 14px', borderRadius: '7px', cursor: 'pointer',
                                            fontWeight: 600, fontSize: '12px', transition: 'all 0.2s',
                                            background: item.sendType === t ? 'var(--purple)' : 'var(--surface-2)',
                                            color: item.sendType === t ? '#fff' : 'var(--text-muted)',
                                            border: `1px solid ${item.sendType === t ? 'var(--purple)' : 'var(--border)'}`,
                                        }}>
                                            {{ text: '💬 Texto', file: '📎 Arquivo', both: '✉️ Ambos' }[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(item.sendType === 'text' || item.sendType === 'both') && (
                                <div>
                                    <label style={labelStyle}>Mensagem</label>
                                    <textarea
                                        value={item.message}
                                        onChange={e => update(item.id, { message: e.target.value })}
                                        rows={3}
                                        placeholder="Digite a mensagem..."
                                        style={{ ...inputStyle, width: '100%', resize: 'none' }}
                                    />
                                </div>
                            )}

                            {(item.sendType === 'file' || item.sendType === 'both') && (
                                <div>
                                    <label style={labelStyle}>
                                        Arquivos {item.files.length > 0 ? `(${item.files.length})` : ''}
                                    </label>
                                    <label style={{
                                        display: 'block', border: '2px dashed var(--purple-light)',
                                        borderRadius: '10px', padding: '14px', textAlign: 'center',
                                        cursor: 'pointer', background: 'var(--purple-dim)',
                                    }}>
                                        <input
                                            key={item.files.length}
                                            type="file"
                                            multiple
                                            style={{ display: 'none' }}
                                            onChange={(e) => handleFileChange(item.id, e)}
                                        />
                                        <p style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '13px' }}>
                                            Clique para selecionar arquivos
                                        </p>
                                    </label>
                                    {item.files.length > 0 && (
                                        <ul style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {item.files.map((f, i) => (
                                                <li key={`${f.name}-${i}`} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    background: 'var(--surface-2)', borderRadius: '6px',
                                                    padding: '6px 12px', fontSize: '12px',
                                                }}>
                                                    <span>📄 {f.name}</span>
                                                    <button
                                                        onClick={() => update(item.id, {
                                                            files: item.files.filter((_, j) => j !== i)
                                                        })}
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
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={() => setItems(prev => [...prev, newItem()])} style={{
                width: '100%', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                fontWeight: 700, fontSize: '14px', transition: 'all 0.2s',
                background: 'var(--surface)', color: 'var(--purple)',
                border: '2px dashed var(--purple-light)',
                marginBottom: '24px',
            }}>
                + Adicionar destinatário
            </button>

            <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '14px', padding: '20px', marginBottom: '20px',
            }}>
                <label style={labelStyle}>Quando enviar (para todos)</label>
                <SchedulePicker value={scheduledAt} onChange={setScheduledAt} />
            </div>

            <button onClick={handleSubmit} disabled={loading} style={{
                width: '100%',
                background: loading ? 'var(--purple-light)' : 'var(--purple)',
                color: '#fff', fontWeight: 700, fontSize: '15px',
                padding: '14px 24px', borderRadius: '10px', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : 'var(--shadow)',
                transition: 'all 0.2s',
            }}>
                {loading ? 'Agendando...' : `Agendar ${items.length} envio${items.length > 1 ? 's' : ''}`}
            </button>

            {success && (
                <div style={{
                    marginTop: '16px', background: '#f0faf5', border: '1px solid var(--success)',
                    borderRadius: '10px', padding: '14px 18px',
                    color: 'var(--success)', fontWeight: 600, fontSize: '14px',
                }}>
                    ✓ {items.length > 1 ? 'Mensagens agendadas' : 'Mensagem agendada'} com sucesso!
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

const inputStyle: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '10px 14px', color: 'var(--text)',
    fontSize: '14px', outline: 'none',
}