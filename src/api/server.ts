import express from 'express'
import cors from 'cors'
import * as SessionManager from '../whatsapp/sessionManager.js'
import fs from 'fs'
import path from 'path'
import { supabase } from '../supabase/client.js'
import { BufferJSON } from '@whiskeysockets/baileys'
import { processScheduledMessages } from '../messaging/scheduler.js'

export const startServer = () => {
    const app = express()
    const PORT = process.env.PORT || 3001

    app.use(cors({ origin: '*' }))
    app.use(express.json())

    app.get('/status', async (req, res) => {
        const userId = req.query.user_id as string
        if (!userId) return res.status(400).json({ error: 'user_id required' })
        
        const connected = SessionManager.isConnected(userId)
        if (connected) {
            SessionManager.updateSessionActivity(userId)
        } else {
            const hasCreds = await SessionManager.hasStoredCredentials(userId)
            if (hasCreds) {
                console.log(`[API] Usuário ${userId} solicitou status e possui credenciais. Restaurando sessão em background...`)
                SessionManager.createUserSession(userId).catch(err =>
                    console.error(`[API] Erro ao restaurar sessão em background para ${userId}:`, err)
                )
            }
        }
        res.json({ connected, hasQR: !!SessionManager.getQR(userId) })
    })

    app.get('/qr', (req, res) => {
        const userId = req.query.user_id as string
        if (!userId) return res.status(400).json({ error: 'user_id required' })
        SessionManager.updateSessionActivity(userId)
        res.json({ qr: SessionManager.getQR(userId) || null })
    })

    app.post('/connect', async (req, res) => {
        const { user_id } = req.body
        if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' })
        
        try {
            await SessionManager.createUserSession(user_id)
            SessionManager.updateSessionActivity(user_id)
            res.json({ ok: true })
        } catch (err) {
            res.status(500).json({ error: 'Erro ao conectar' })
        }
    })

    app.get('/sessions', async (req, res) => {
        try {
            const { data: sessionFiles, error: sessionErr } = await supabase
                .from('whatsapp_session_files')
                .select('user_id, updated_at')

            if (sessionErr) throw sessionErr

            // Agrupa pelo último modified time do arquivo creds.json ou último arquivo modificado
            const userActivityMap: Record<string, string> = {}
            if (sessionFiles) {
                sessionFiles.forEach(row => {
                    const rowDate = new Date(row.updated_at)
                    const existingDateStr = userActivityMap[row.user_id]
                    if (!existingDateStr || rowDate > new Date(existingDateStr)) {
                        userActivityMap[row.user_id] = row.updated_at
                    }
                })
            }

            const folders = Object.keys(userActivityMap)

            // Buscar nomes dos usuários no banco de dados para cruzar os dados
            let usernamesMap: Record<string, string> = {}
            try {
                const { data: profiles, error } = await supabase
                    .from('user_profiles')
                    .select('id, username')

                if (!error && profiles) {
                    profiles.forEach(p => {
                        usernamesMap[p.id] = p.username
                    })
                }
            } catch (dbErr) {
                console.error('Erro ao buscar perfis no banco de dados:', dbErr)
            }

            const sessionList = folders.map(userId => {
                const lastActivity = userActivityMap[userId]
                const lastActivityDate = new Date(lastActivity)
                
                // Formatando data para o fuso horário de Brasília (UTC-3)
                const lastActivityBRT = lastActivityDate.toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo'
                })

                return {
                    userId,
                    username: usernamesMap[userId] || 'desconhecido/inativo',
                    connected: SessionManager.isConnected(userId),
                    hasQR: !!SessionManager.getQR(userId),
                    lastActivity: lastActivityBRT
                }
            })
            
            res.json(sessionList)
        } catch (err) {
            console.error('Erro ao buscar sessões:', err)
            res.status(500).json({ error: 'Erro ao listar sessões' })
        }
    })

    // Rota para exportar as sessões locais da Railway
    app.get('/export-sessions', (req, res) => {
        const secret = req.query.secret as string
        if (!secret || secret !== process.env.SUPABASE_KEY) {
            return res.status(401).json({ error: 'Não autorizado' })
        }

        const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
        const authBase = path.join(base, 'auth')

        if (!fs.existsSync(authBase)) {
            return res.json([])
        }

        const exportedFiles: { userId: string; filename: string; content: string }[] = []

        try {
            const userIds = fs.readdirSync(authBase).filter(name => {
                return fs.statSync(path.join(authBase, name)).isDirectory()
            })

            for (const userId of userIds) {
                const userFolder = path.join(authBase, userId)
                const files = fs.readdirSync(userFolder).filter(f => f.endsWith('.json'))

                for (const file of files) {
                    const filePath = path.join(userFolder, file)
                    const content = fs.readFileSync(filePath, 'utf-8')
                    exportedFiles.push({
                        userId,
                        filename: file,
                        content
                    })
                }
            }

            res.json(exportedFiles)
        } catch (err: any) {
            console.error('Erro ao exportar sessões:', err)
            res.status(500).json({ error: 'Erro ao exportar: ' + err.message })
        }
    })

    // Rota para a Hugging Face puxar as sessões do Railway
    app.post('/import-sessions', async (req, res) => {
        const { source_url } = req.body
        if (!source_url) {
            return res.status(400).json({ error: 'source_url é obrigatório' })
        }

        try {
            const response = await fetch(`${source_url}/export-sessions?secret=${encodeURIComponent(process.env.SUPABASE_KEY!)}`)
            if (!response.ok) {
                const errText = await response.text()
                return res.status(response.status).json({ error: `Erro ao exportar da Railway: ${errText}` })
            }

            const files = (await response.json()) as { userId: string; filename: string; content: string }[]
            console.log(`[Import] Recebidos ${files.length} arquivos para importar.`)

            let importedCount = 0
            for (const file of files) {
                try {
                    const parsed = JSON.parse(file.content, BufferJSON.reviver)
                    const content = JSON.stringify(parsed, BufferJSON.replacer)

                    const { error } = await supabase
                        .from('whatsapp_session_files')
                        .upsert({
                            user_id: file.userId,
                            filename: file.filename,
                            content,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'user_id,filename'
                        })

                    if (error) {
                        console.error(`[Import] Erro ao gravar ${file.filename}:`, error.message)
                    } else {
                        importedCount++
                    }
                } catch (parseErr) {
                    console.error(`[Import] Erro de processamento em ${file.filename}:`, parseErr)
                }
            }

            // Forçar reconexão de todas as sessões importadas
            await SessionManager.restoreAllSessions()

            res.json({
                success: true,
                total_files: files.length,
                imported_files: importedCount,
                message: 'Importação concluída e sessões restauradas com sucesso!'
            })
        } catch (err: any) {
            console.error('Erro ao importar sessões:', err)
            res.status(500).json({ error: 'Erro na importação: ' + err.message })
        }
    })

    app.post('/disconnect', async (req, res) => {
        const { user_id } = req.body
        if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' })
        
        try {
            await SessionManager.disconnectUserSession(user_id)
            res.json({ ok: true, message: `Sessão do usuário ${user_id} removida com sucesso.` })
        } catch (err) {
            res.status(500).json({ error: 'Erro ao desconectar sessão' })
        }
    })

    app.post('/process-queue', async (req, res) => {
        const secret = req.query.secret as string || req.headers['x-api-secret'] as string
        if (!secret || secret !== process.env.SUPABASE_KEY) {
            return res.status(401).json({ error: 'Não autorizado' })
        }

        try {
            console.log('[API] Executando processamento da fila de mensagens sob demanda...')
            await processScheduledMessages()
            res.json({ success: true })
        } catch (err: any) {
            console.error('[API] Erro ao processar fila de mensagens:', err)
            res.status(500).json({ error: err.message || 'Erro interno' })
        }
    })
 
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`))
}