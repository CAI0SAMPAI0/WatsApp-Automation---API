import makeWASocket, {
    DisconnectReason,
    fetchLatestWaWebVersion,
    useMultiFileAuthState,
    WASocket
} from 'baileys'
import { setQR, setConnected } from '../api/server'
import QRCode from 'qrcode'
import { syncContacts, syncIndividualContacts } from './sync'

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
            await syncContacts(sock)  // <- sincroniza grupos ao conectar
        }
    })

    // Captura contatos individuais quando o WhatsApp os envia
    sock.ev.on('messaging-history.set', async ({ contacts }) => {
        await syncIndividualContacts(contacts)
    })

    sock.ev.on('creds.update', saveCreds)

    return sock
}