import { WASocket, DisconnectReason, ConnectionState, BufferJSON } from '@whiskeysockets/baileys'
import makeWASocket from '@whiskeysockets/baileys'
import path from 'path'
import fs from 'fs'
import { syncContacts } from './sync.js'
import { useSupabaseAuthState } from '../supabase/authState.js'
import { supabase } from '../supabase/client.js'

const sessions = new Map<string, WASocket>()
const qrCodes = new Map<string, string>()
const reconnectTimers = new Map<string, NodeJS.Timeout>()
const lastActiveTimes = new Map<string, number>()
const connectingPromises = new Map<string, Promise<WASocket>>()
const idleDisconnectedUsers = new Set<string>()

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

    const { state, saveCreds } = await useSupabaseAuthState(userId)

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
            lastActiveTimes.set(userId, Date.now())
            try {
                await syncContacts(socket, userId)
            } catch (err) {
                console.error(`Erro ao sincronizar grupos para ${userId}:`, err)
            }
        }

        if (connection === 'close') {
            const isIdleDisc = idleDisconnectedUsers.has(userId)
            if (isIdleDisc) {
                idleDisconnectedUsers.delete(userId)
                console.log(`Conexão fechada por ociosidade para ${userId}. Não reconectando.`)
                sessions.delete(userId)
                lastActiveTimes.delete(userId)
                qrCodes.delete(userId)
                return
            }

            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            console.log(`Conexão fechada para ${userId}. Código: ${statusCode}. Reconectar: ${shouldReconnect}`)

            sessions.delete(userId)
            lastActiveTimes.delete(userId)

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
                console.log(`Usuário ${userId} deslogou. Removendo credenciais do Supabase.`)
                await supabase.from('whatsapp_session_files').delete().eq('user_id', userId)

                const folder = getAuthFolder(userId)
                if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
            }
        }
    })

    sessions.set(userId, socket)
    return socket
}

export const restoreAllSessions = async (): Promise<void> => {
    const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
    const authBase = path.join(base, 'auth')

    // 1. Migração Automática se encontrar arquivos locais
    if (fs.existsSync(authBase)) {
        const userIdsLocal = fs.readdirSync(authBase).filter(name => {
            const fullPath = path.join(authBase, name)
            return fs.statSync(fullPath).isDirectory()
        })

        if (userIdsLocal.length > 0) {
            console.log(`[Migration] Encontrados arquivos de sessões locais no volume. Migrando ${userIdsLocal.length} usuários para o Supabase...`)
            for (const userId of userIdsLocal) {
                const folderPath = path.join(authBase, userId)
                const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))
                
                for (const file of files) {
                    const filePath = path.join(folderPath, file)
                    const stats = fs.statSync(filePath)
                    const rawContent = fs.readFileSync(filePath, 'utf-8')
                    try {
                        const parsed = JSON.parse(rawContent, BufferJSON.reviver)
                        const content = JSON.stringify(parsed, BufferJSON.replacer)
                        await supabase.from('whatsapp_session_files').upsert({
                            user_id: userId,
                            filename: file,
                            content,
                            updated_at: stats.mtime.toISOString()
                        }, { onConflict: 'user_id,filename' })
                    } catch (err) {
                        console.error(`[Migration] Erro no arquivo ${file} para ${userId}:`, err)
                    }
                }
                // Limpar pasta local após migrar com sucesso
                fs.rmSync(folderPath, { recursive: true, force: true })
            }
            console.log(`[Migration] Migração de arquivos locais finalizada com sucesso!`)
        }
    }

    // 2. Restaurar a partir do Supabase
    try {
        const { data: sessionFiles, error } = await supabase
            .from('whatsapp_session_files')
            .select('user_id')
            .eq('filename', 'creds.json')

        if (error) throw error

        const userIds = Array.from(new Set(sessionFiles?.map(s => s.user_id) || []))

        console.log(`Restaurando ${userIds.length} sessão(ões) salva(s) no Supabase...`)

        for (const userId of userIds) {
            try {
                await createUserSession(userId)
                console.log(`Sessão restaurada para: ${userId}`)
            } catch (err) {
                console.error(`Falha ao restaurar sessão de ${userId}:`, err)
            }
        }
    } catch (err) {
        console.error('Erro ao buscar sessões para restauração:', err)
    }
}

export const getUserSession = (userId: string) => sessions.get(userId)
export const getQR = (userId: string) => qrCodes.get(userId)
export const isConnected = (userId: string) => sessions.get(userId)?.user !== undefined
export const getActiveUserIds = (): string[] => {
    return Array.from(sessions.keys()).filter(userId => isConnected(userId))
}

export const updateSessionActivity = (userId: string) => {
    lastActiveTimes.set(userId, Date.now())
}

export const hasStoredCredentials = async (userId: string): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('whatsapp_session_files')
            .select('user_id')
            .eq('user_id', userId)
            .eq('filename', 'creds.json')
            .maybeSingle()

        if (error) {
            console.error(`[SessionManager] Erro ao verificar credenciais de ${userId}:`, error.message)
            return false
        }
        return !!data
    } catch (err) {
        console.error(`[SessionManager] Falha ao verificar credenciais de ${userId}:`, err)
        return false
    }
}

export const getOrRestoreSession = async (userId: string, timeoutMs = 20000): Promise<WASocket> => {
    if (isConnected(userId)) {
        updateSessionActivity(userId)
        const sock = getUserSession(userId)
        if (sock) return sock
    }

    let promise = connectingPromises.get(userId)
    if (!promise) {
        promise = new Promise<WASocket>(async (resolve, reject) => {
            try {
                console.log(`[SessionManager] Restaurando sessão sob demanda para o usuário ${userId}...`)
                await createUserSession(userId)
                
                const checkInterval = setInterval(() => {
                    if (isConnected(userId)) {
                        clearInterval(checkInterval)
                        connectingPromises.delete(userId)
                        const sock = getUserSession(userId)
                        if (sock) {
                            updateSessionActivity(userId)
                            resolve(sock)
                        } else {
                            reject(new Error('Sessão desconectada durante inicialização'))
                        }
                    }
                }, 500)

                setTimeout(() => {
                    clearInterval(checkInterval)
                    connectingPromises.delete(userId)
                    reject(new Error('Timeout ao conectar sessão do WhatsApp'))
                }, timeoutMs)
            } catch (err) {
                connectingPromises.delete(userId)
                reject(err)
            }
        })
        connectingPromises.set(userId, promise)
    }

    return promise
}

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
        lastActiveTimes.delete(userId)
        qrCodes.delete(userId)
    }

    // Deletar da tabela do Supabase
    await supabase.from('whatsapp_session_files').delete().eq('user_id', userId)

    const folder = getAuthFolder(userId)
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true })
}

// Timer para limpar conexões ociosas e economizar recursos
setInterval(() => {
    const idleTimeout = 2 * 60 * 1000 // 2 minutos de ociosidade
    const now = Date.now()
    for (const [userId, socket] of sessions.entries()) {
        if (!isConnected(userId)) {
            continue
        }
        
        const lastActive = lastActiveTimes.get(userId) || 0
        if (now - lastActive > idleTimeout) {
            console.log(`[SessionManager] Sessão do usuário ${userId} inativa por mais de 2 minutos. Desconectando para economizar recursos...`)
            
            idleDisconnectedUsers.add(userId)
            sessions.delete(userId)
            qrCodes.delete(userId)
            lastActiveTimes.delete(userId)
            
            const timer = reconnectTimers.get(userId)
            if (timer) {
                clearTimeout(timer)
                reconnectTimers.delete(userId)
            }
            
            try {
                socket.end(undefined)
            } catch (err) {
                console.error(`Erro ao encerrar socket ocioso de ${userId}:`, err)
            }
        }
    }
}, 30000)