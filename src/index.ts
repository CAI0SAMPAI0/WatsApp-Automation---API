import 'dotenv/config'
import { startScheduler } from './messaging/scheduler'
import { startServer } from './api/server'

const main = async () => {
    startServer()
    startScheduler()
    console.log('API e Agendador iniciados.')
}

main()