import 'dotenv/config'
import { createConnection } from './whatsapp/connection'
import { startScheduler } from './messaging/scheduler'
import { startServer } from './api/server'

const main = async () => {
    startServer()
    const sock = await createConnection()
    console.log('Bot iniciado, socket pronto:', !!sock)

    startScheduler(sock)
}

main()