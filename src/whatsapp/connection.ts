import makeWASocket, {
    DisconnectReason,
    fetchLatestWaWebVersion,
    useMultiFileAuthState,
    WASocket
} from 'baileys'
import { setQR, setConnected } from '../api/server'
import QRCode from 'qrcode'
import { syncContacts, syncIndividualContacts } from './sync'
import { supabase } from '../supabase/client'

const userID = "00000000-0000-0000-0000-000000000001"; // UUID válido temporário

export const createConnection = async (): Promise<WASocket> => {
    const { version } = await fetchLatestWaWebVersion()
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        auth: state,
        version
    })

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            setQR(qr)
            console.log(await QRCode.toString(qr, { type: 'terminal' }))
        }

        if (connection === 'close') {
            setConnected(false)
            const shouldReconnect =
                (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut

            console.log('Conexão fechada. Reconectando:', shouldReconnect)

            if (shouldReconnect) {
                await createConnection()
            }
        } else if (connection === 'open') {
            setConnected(true)
            console.log('Conectado com sucesso!')
            await syncContacts(sock, userID)  // <- sincroniza grupos ao conectar
        }
    })

    // Captura contatos individuais quando o WhatsApp os envia
    sock.ev.on('messaging-history.set', async ({ contacts }) => {
        console.log(`Evento contacts.set recebido com ${contacts.length} contatos.`);
    })

    sock.ev.on('groups.upsert', async (groups) => {
        const groupsToSave = groups.map((g) => ({
            jid: g.id,
            subject: g.subject,
            user_id: userID
        }))

        const { error } = await supabase
            .from('groups')
            .upsert(groupsToSave, { onConflict: 'jid, user_id' })

        if (error) console.error('Erro ao salvar novos grupos:', error.message)
        else console.log(`${groupsToSave.length} grupo(s) atualizados.`)
    })

    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            if (!update.subject) continue
            const { error } = await supabase
                .from('groups')
                .update({ subject: update.subject })
                .eq('jid', update.id)

            if (error) console.error('Erro ao atualizar grupo:', error.message)
            else console.log(`Grupo ${update.id} atualizado: ${update.subject}`)
        }
    })

    sock.ev.on('creds.update', saveCreds)

    return sock
}