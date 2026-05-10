import 'dotenv/config'
import { startScheduler } from './messaging/scheduler.js'
import { startServer } from './api/server.js'
import { restoreAllSessions } from './whatsapp/sessionManager.js'

const main = async () => {
    startServer()

    // Restaura todas as sessões salvas em disco ANTES de iniciar o agendador e garante envio contínuo sem precisar do frontend aberto.
    console.log('Restaurando sessões do WhatsApp...')
    await restoreAllSessions()

    startScheduler()
    console.log('✅ API, sessões e agendador iniciados.')
}

main()