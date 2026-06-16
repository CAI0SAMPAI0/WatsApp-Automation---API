import 'dotenv/config'
import { startScheduler } from './messaging/scheduler.js'
import { startServer } from './api/server.js'
import { restoreAllSessions } from './whatsapp/sessionManager.js'

const main = async () => {
    startServer()
    await restoreAllSessions()
    startScheduler()
}
main()