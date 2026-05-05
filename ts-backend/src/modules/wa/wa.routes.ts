import { FastifyInstance } from "fastify";
import { WhatsAppManager } from "./wa.manager.js";
import { prisma } from "../../lib/prisma.js";

export async function waRoutes(app: FastifyInstance) {
  // Hook de autenticação para todas as rotas deste módulo
  app.addHook("preHandler", async (request, reply) => {
    try {
      // Se for websocket, o token vem no query string via 'token'
      if (request.url.includes("/wa/connect")) {
        const query = request.query as { token?: string };
        if (query.token) {
          const decoded = await app.jwt.verify(query.token);
          (request as any).user = decoded;
          return;
        }
      }
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Não autorizado" });
    }
  });

  app.get("/wa/status", async (request, reply) => {
    const userId = (request.user as any).sub;
    const session = await prisma.waSession.findFirst({
      where: { userId }
    });
    return { connected: session?.isConnected || false };
  });

  // WebSocket for QR Code
  app.get("/wa/connect", { websocket: true }, async (connection, request) => {
    // CAPTURA O SOCKET IMEDIATAMENTE
    const socket = connection.socket;
    let userId: string | null = null;

    if (!socket) {
      console.error("[WS] Socket não inicializado corretamente");
      return;
    }

    try {
      const query = request.query as { token?: string };
      const token = query.token;
      if (!token) throw new Error("Sem token");
      
      const decoded = await app.jwt.verify(token) as any;
      userId = decoded.sub;
    } catch (err) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: "error", message: "Autenticação falhou" }));
        socket.close();
      }
      return;
    }

    console.log(`[WS] Cliente conectado: ${userId}`);

    // FUNÇÃO LOCAL QUE GARANTE REFERÊNCIA AO SOCKET DESTA CONEXÃO
    const qrHandler = (qr: string) => {
      console.log(`[WA] Enviando QR para o cliente ${userId}`);
      if (socket && socket.readyState === 1) {
        try {
          socket.send(JSON.stringify({ type: "qr", qr }));
        } catch (e) {
          console.error("[WS] Erro ao enviar QR:", e);
        }
      }
    };

    WhatsAppManager.getSession(userId!, qrHandler).then(() => {
      console.log(`[WA] Sessão pronta para ${userId}`);
    }).catch(err => {
      console.error("[WA] Erro ao iniciar sessão:", err);
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: "error", message: "Erro no WhatsApp" }));
      }
    });

    socket.on("close", () => {
      console.log(`[WS] Cliente desconectado: ${userId}`);
      if (userId) WhatsAppManager.removeQRListener(userId, qrHandler);
    });
  });
}
