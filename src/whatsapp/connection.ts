import makeWASocket, {
    DisconnectReason,
    fetchLatestWaWebVersion,
    useMultiFileAuthState,
    WASocket
} from 'baileys'
import { setQR, setConnected, getCurrentUserId } from '../api/server'
import QRCode from 'qrcode'
import { syncContacts } from './sync'
import { supabase } from '../supabase/client'
import fs from 'fs'
import path from 'path'

export const createConnection = async (): Promise<WASocket> => {
    const authPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
        ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'auth')
        : 'auth'

    if (process.env.RESET_AUTH === 'true') {
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true })
            console.log('Auth deletado:', authPath)
        }
    }

    const { version } = await fetchLatestWaWebVersion()
    const { state, saveCreds } = await useMultiFileAuthState(authPath)

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
        if (shouldReconnect) await createConnection()
    } else if (connection === 'open') {
        setConnected(true)
        console.log('Conectado com sucesso!')

        const userID = getCurrentUserId()
        if (!userID) {
            console.error('Nenhum usuário conectado, ignorando sync')
            return
        }
        await syncContacts(sock, userID)
    }
})

sock.ev.on('groups.upsert', async (groups) => {
    const userID = getCurrentUserId()
    if (!userID) return

    const groupsToSave = groups.map((g) => ({
        jid: g.id,
        subject: g.subject,
        user_id: userID
    }))

    const { error } = await supabase
        .from('groups')
        .upsert(groupsToSave, { onConflict: 'jid, user_id' })

    if (error) console.error('Erro ao salvar novos grupos:', error.message)
})

sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
        if (!update.subject) continue
        const { error } = await supabase
            .from('groups')
            .update({ subject: update.subject })
            .eq('jid', update.id)
        if (error) console.error('Erro ao atualizar grupo:', error.message)
    }
})

sock.ev.on('creds.update', saveCreds)

return sock
}