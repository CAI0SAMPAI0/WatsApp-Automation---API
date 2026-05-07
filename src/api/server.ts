import express from 'express'

let currentQR: string | null = null
let isConnected = false

export const setQR = (qr: string) => { currentQR = qr }
export const setConnected = (status: boolean) => { isConnected = status; if (status) currentQR = null }

export const startServer = () => {
    const app = express()

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*')
        next()
    })

    app.get('/status', (req, res) => {
        res.json({ connected: isConnected, hasQR: !!currentQR })
    })

    app.get('/qr', (req, res) => {
        if (!currentQR) return res.json({ qr: null })
        res.json({ qr: currentQR })
    })

    app.listen(3001, () => console.log('API rodando na porta 3001'))
}