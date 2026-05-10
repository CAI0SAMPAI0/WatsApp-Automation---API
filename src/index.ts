import 'dotenv/config'
import { startScheduler } from './messaging/scheduler.js'
import { startServer } from './api/server.js'

const main = async () => {
    startServer()
    startScheduler()
    console.log('API e Agendador iniciados.')
}

main()