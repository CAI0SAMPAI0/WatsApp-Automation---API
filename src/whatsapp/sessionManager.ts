import { WASocket, useMultiFileAuthState, DisconnectReason, ConnectionState } from '@whiskeysockets/baileys'
import makeWASocket from '@whiskeysockets/baileys'
import path from 'path'
import fs from 'fs'
import { syncContacts } from './sync.js'

const sessions = new Map<string, WASocket>()
const qrCodes = new Map<string, string>()
const reconnectTimers = new Map<string, NodeJS.Timeout>()

const getAuthFolder = (userId: string) => {
    const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
    return path.join(base, 'auth', userId)
}

export const createUserSession = async (userId: string): Promise<WASocket> => {
    // Cancela timer de reconexão anterior se existir
    const existingTimer = reconnectTimers.get(userId)
    if (existingTimer) {
        clearTimeout(existingTimer)
        reconnectTimers.delete(userId)
    }

    const { state, saveCreds } = await useMultiFileAuthState(getAuthFolder(userId))

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 30_000,
        keepAliveIntervalMs: 25_000,
        retryRequestDelayMs: 2000,
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            qrCodes.set(userId, qr)
            console.log(`QR gerado para usuário: ${userId}`)
        }

        if (connection === 'open') {
            qrCodes.delete(userId)
            sessions.set(userId, socket)
            console.log(`✅ Sessão aberta para: ${userId}`)
            // Sincroniza grupos após conectar
            try {
                await syncContacts(socket, userId)
            } catch (err) {
                console.error(`Erro ao sincronizar grupos para ${userId}:`, err)
            }
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            console.log(`Conexão fechada para ${userId}. Código: ${statusCode}. Reconectar: ${shouldReconnect}`)

            sessions.delete(userId)

            if (shouldReconnect) {
                const delay = 5000
                console.log(`Reconectando ${userId} em ${delay / 1000}s...`)
                const timer = setTimeout(() => {
                    reconnectTimers.delete(userId)
                    createUserSession(userId).catch(err =>
                        console.error(`Falha ao reconectar ${userId}:`, err)
                    )
                }, delay)
                reconnectTimers.set(userId, timer)
            } else {
                // Usuário deslogou — remove credenciais
                console.log(`Usuário ${userId} deslogou. Removendo credenciais.`)
                const folder = getAuthFolder(userId)
                if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
            }
        }
    })

    sessions.set(userId, socket)
    return socket
}

/**
 * Carrega todas as sessões salvas em disco ao iniciar o bot.
 * Isso garante que as mensagens continuam sendo enviadas mesmo sem o frontend aberto.
 */
export const restoreAllSessions = async (): Promise<void> => {
    const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
    const authBase = path.join(base, 'auth')

    if (!fs.existsSync(authBase)) {
        console.log('Nenhuma sessão salva encontrada.')
        return
    }

    const userIds = fs.readdirSync(authBase).filter(name => {
        const fullPath = path.join(authBase, name)
        return fs.statSync(fullPath).isDirectory()
    })

    console.log(`Restaurando ${userIds.length} sessão(ões) salva(s)...`)

    for (const userId of userIds) {
        try {
            await createUserSession(userId)
            console.log(`Sessão restaurada para: ${userId}`)
        } catch (err) {
            console.error(`Falha ao restaurar sessão de ${userId}:`, err)
        }
    }
}

export const getUserSession = (userId: string) => sessions.get(userId)
export const getQR = (userId: string) => qrCodes.get(userId)
export const isConnected = (userId: string) => sessions.get(userId)?.user !== undefined

export const disconnectUserSession = async (userId: string) => {
    const timer = reconnectTimers.get(userId)
    if (timer) {
        clearTimeout(timer)
        reconnectTimers.delete(userId)
    }

    const socket = sessions.get(userId)
    if (socket) {
        await socket.end(undefined)
        sessions.delete(userId)
    }

    const folder = getAuthFolder(userId)
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
}