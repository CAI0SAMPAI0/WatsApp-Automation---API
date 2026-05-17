import { supabase } from '../supabase/client.js'
import { sendMessage } from './sender.js'
import { SendType } from '../types/index.js'
import * as SessionManager from '../whatsapp/sessionManager.js'

export const startScheduler = (): void => {
    console.log('Agendador iniciado...')

    setInterval(async () => {
        const now = new Date().toISOString()

        // Busca apenas mensagens que ainda não foram enviadas e não estão em processamento
        const { data, error } = await supabase
            .from('scheduled_messages')
            .select('*')
            .eq('sent', false)
            .eq('processing', false)
            .lte('scheduled_at', now)

        if (error) {
            console.error('Erro ao buscar mensagens agendadas:', error.message)
            return
        }

        if (!data || data.length === 0) return

        for (const msg of data) {
            const sock = SessionManager.getUserSession(msg.user_id)
            if (!sock || !SessionManager.isConnected(msg.user_id)) {
                console.warn(`Sessão indisponível para o usuário ${msg.user_id}, pulando mensagem ${msg.id}`)
                continue
            }

            // Marca como em processamento ANTES de enviar para evitar reprocessamento
            const { error: lockError } = await supabase
                .from('scheduled_messages')
                .update({ processing: true })
                .eq('id', msg.id)
                .eq('processing', false) // double-check: só atualiza se ainda for false

            if (lockError) {
                console.warn(`Não foi possível travar mensagem ${msg.id}, pulando.`)
                continue
            }

            // Processa de forma assíncrona sem bloquear o loop
            ;(async () => {
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
                        .update({ sent: true, processing: false })
                        .eq('id', msg.id)

                    console.log(`Mensagem ${msg.id} enviada com sucesso.`)
                } catch (err) {
                    console.error(`Falha ao enviar mensagem ${msg.id}:`, err)
                    // Libera o lock para tentar novamente na próxima rodada
                    await supabase
                        .from('scheduled_messages')
                        .update({ processing: false })
                        .eq('id', msg.id)
                }
            })()
        }
    }, 5000)
}