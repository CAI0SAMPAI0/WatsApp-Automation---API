import { supabase } from '../supabase/client.js'
import { sendMessage } from './sender.js'
import { SendType } from '../types/index.js'
import * as SessionManager from '../whatsapp/sessionManager.js'

const processingIds = new Set<string>()

export const startScheduler = (): void => {
    console.log('Agendador iniciado...')

    setInterval(async () => {
        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('sent', false)
            .lte('scheduled_at', now)

        if (error) {
            console.error('Erro ao buscar mensagens agendadas:', error.message)
            return
        }

        if (!data || data.length === 0) return

        console.log(`[Scheduler] ${data.length} mensagem(ns) para processar`)

        for (const msg of data) {
            if (processingIds.has(msg.id)) {
                console.log(`[Scheduler] Mensagem ${msg.id} já em processamento, pulando`)
                continue
            }

            const isConnected = SessionManager.isConnected(msg.user_id)
            const sock = SessionManager.getUserSession(msg.user_id)

            console.log(`[Scheduler] Mensagem ${msg.id} | user: ${msg.user_id} | conectado: ${isConnected} | sock: ${!!sock}`)

            if (!sock || !isConnected) {
                console.warn(`[Scheduler] Sessão indisponível para ${msg.user_id}, pulando mensagem ${msg.id}`)
                continue
            }

            processingIds.add(msg.id)

            ;(async () => {
                try {
                    console.log(`[Scheduler] Enviando mensagem ${msg.id} para ${msg.contact_jid}`)
                    console.log(`[Scheduler] Tipo: ${msg.send_type} | Tem mensagem: ${!!msg.message} | Arquivos: ${msg.files?.length ?? 0}`)

                    await sendMessage(sock, {
                        contact_jid: msg.contact_jid,
                        send_type: msg.send_type as SendType,
                        message: msg.message,
                        file_urls: msg.files ?? [],
                        scheduled_at: new Date(msg.scheduled_at)
                    })

                    const { error: updateError } = await supabase
                        .from('scheduled_messages')
                        .update({ sent: true })
                        .eq('id', msg.id)

                    if (updateError) {
                        console.error(`[Scheduler] Erro ao marcar mensagem ${msg.id} como enviada:`, updateError.message)
                    } else {
                        console.log(`[Scheduler] ✅ Mensagem ${msg.id} enviada e marcada com sucesso`)
                    }
                } catch (err) {
                    console.error(`[Scheduler] ❌ Falha ao enviar mensagem ${msg.id}:`, err)
                } finally {
                    processingIds.delete(msg.id)
                }
            })()
        }
    }, 5000)
}