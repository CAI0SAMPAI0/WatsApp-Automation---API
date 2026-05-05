import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  AuthenticationState
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { prisma } from "../../lib/prisma.js";

const sessions = new Map();
const qrListeners = new Map<string, Set<(qr: string) => void>>();

export class WhatsAppManager {
  static async getSession(userId: string, onQR?: (qr: string) => void) {
    if (onQR) {
      const listeners = qrListeners.get(userId) || new Set();
      listeners.add(onQR);
      qrListeners.set(userId, listeners);
    }

    if (sessions.has(userId)) {
      const sock = sessions.get(userId);
      if (sock.authState.creds.registered) return sock;
      
      // Se não estiver registrado e o usuário pediu QR via botão, 
      // vamos encerrar a sessão travada para gerar um QR novo.
      if (onQR) {
        console.log(`[WA] Limpando sessão pendente para ${userId}`);
        try { sock.end(undefined); } catch(e) {}
        sessions.delete(userId);
      } else {
        return sock;
      }
    }

    console.log(`[WA] Iniciando Baileys para: ${userId}`);
    const { state, saveCreds } = await this.getAuthState(userId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
    });

    sessions.set(userId, sock);
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log(`[WA] Novo QR Code para ${userId}`);
        const listeners = qrListeners.get(userId);
        listeners?.forEach(l => l(qr));
      }

      if (connection === "close") {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        sessions.delete(userId);
        if (shouldReconnect) {
          console.log(`[WA] Reconectando ${userId}...`);
          this.getSession(userId);
        } else {
          qrListeners.delete(userId);
          await prisma.waSession.updateMany({ where: { userId }, data: { isConnected: false } });
        }
      } else if (connection === "open") {
        console.log(`[WA] Conectado: ${userId}`);
        qrListeners.delete(userId);
        await prisma.waSession.upsert({
          where: { sessionKey: `session_${userId}` },
          create: { userId, sessionKey: `session_${userId}`, authStateJson: JSON.stringify(state), isConnected: true },
          update: { isConnected: true }
        });
      }
    });

    return sock;
  }

  static removeQRListener(userId: string, callback: (qr: string) => void) {
    const listeners = qrListeners.get(userId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) qrListeners.delete(userId);
    }
  }

  private static async getAuthState(userId: string) {
    return useMultiFileAuthState(`./sessions/user_${userId}`);
  }

  static async sendText(userId: string, jid: string, text: string) {
    const sock = await this.getSession(userId);
    return sock.sendMessage(jid, { text });
  }

  static async sendMedia(userId: string, jid: string, url: string, caption?: string) {
    const sock = await this.getSession(userId);
    return sock.sendMessage(jid, { 
      document: { url }, 
      fileName: url.split("/").pop(),
      caption 
    });
  }
}
