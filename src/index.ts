import 'dotenv/config'
import { createConnection } from './whatsapp/connection'
import { startScheduler } from './messaging/scheduler'

const main = async () => {
    const sock = await createConnection()
    console.log('Bot iniciado, socket pronto:', !!sock)

    startScheduler(sock)
}

main()