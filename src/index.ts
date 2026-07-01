import 'dotenv/config'
import { startScheduler } from './messaging/scheduler.js'
import { startServer } from './api/server.js'
import { restoreAllSessions } from './whatsapp/sessionManager.js'

const main = async () => {
    startServer()
    
    if (process.env.RESTORE_SESSIONS_ON_START === 'true') {
        console.log('Restaurando sessões na inicialização por configuração...')
        await restoreAllSessions()
    }
    
    if (process.env.ENABLE_INTERNAL_SCHEDULER === 'true') {
        console.log('Iniciando scheduler interno por configuração...')
        startScheduler()
    }
}
main()