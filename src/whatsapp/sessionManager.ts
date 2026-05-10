import { WASocket, useMultiFileAuthState, DisconnectReason, ConnectionState } from '@whiskeysockets/baileys'
import makeWASocket from '@whiskeysockets/baileys'
import path from 'path'
import fs from 'fs'
import { syncContacts } from './sync.js'

const sessions = new Map<string, WASocket>()
const qrCodes = new Map<string, string>()

const getAuthFolder = (userId: string) => {
    const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
    return path.join(base, 'auth', userId)
}

export const createUserSession = async (userId: string) => {
    const { state, saveCreds } = await useMultiFileAuthState(getAuthFolder(userId))

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) qrCodes.set(userId, qr)
        if (connection === 'open') {
            qrCodes.delete(userId)
            console.log(`Sessão aberta para: ${userId}`)
            
            // Sincroniza grupos após conectar
            try {
                await syncContacts(socket, userId)
            } catch (e) {
                console.error('Erro ao sincronizar grupos:', e)
            }
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                setTimeout(() => createUserSession(userId), 5000)
            }
        }
    })

    sessions.set(userId, socket)
    return socket
}
// ... rest of file (getUserSession, getQR, isConnected, disconnectUserSession are unchanged)

export const getUserSession = (userId: string) => sessions.get(userId)
export const getQR = (userId: string) => qrCodes.get(userId)
export const isConnected = (userId: string) => sessions.get(userId)?.user !== undefined

export const disconnectUserSession = async (userId: string) => {
    const socket = sessions.get(userId)
    if (socket) {
        await socket.end(undefined)
        sessions.delete(userId)
    }
    const folder = getAuthFolder(userId)
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
}
