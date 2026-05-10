import { supabase } from '../supabase/client'
import { sendMessage } from './sender'
import { SendType } from '../types'
import * as SessionManager from '../whatsapp/sessionManager'

const processing = new Set<string>()

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

        for (const msg of data) {
            if (processing.has(msg.id)) continue
            processing.add(msg.id)

            const sock = SessionManager.getUserSession(msg.user_id)
            if (!sock || !SessionManager.isConnected(msg.user_id)) {
                console.warn(`Sessão indisponível para o usuário ${msg.user_id}, pulando mensagem ${msg.id}`)
                processing.delete(msg.id)
                continue
            }

            try {
                await sendMessage(sock, {
                    contact_jid: msg.contact_jid,
                    send_type: msg.send_type as SendType,
                    message: msg.message,
                    file_urls: msg.files ?? [],
                    scheduled_at: new Date(msg.scheduled_at)
                })

                await supabase
                    .from('scheduled_messages')
                    .update({ sent: true })
                    .eq('id', msg.id)

                console.log(`Mensagem ${msg.id} enviada e marcada como sent.`)
            } catch (err) {
                console.error(`Falha ao enviar mensagem ${msg.id}:`, err)
            } finally {
                processing.delete(msg.id)
            }
        }
    }, 5000)
}