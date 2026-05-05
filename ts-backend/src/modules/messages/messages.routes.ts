import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { messageQueue } from "../wa/wa.queue.js";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  app.get("/messages", async (request, reply) => {
    const userId = (request.user as any).sub;
    const messages = await prisma.scheduledMessage.findMany({
      where: { userId },
      orderBy: { scheduledAtTz: "desc" },
    });
    return { ok: true, messages };
  });

  app.post("/messages/schedule", async (request, reply) => {
    const userId = (request.user as any).sub;
    const schema = z.object({
      targetJid: z.string(),
      mode: z.enum(["text", "file", "file_text"]),
      message: z.string().optional(),
      fileUrl: z.string().optional(),
      fileName: z.string().optional(),
      scheduledAt: z.string(), // ISO String
    });

    const data = schema.parse(request.body);
    
    // Normalize to +5s rule
    const now = new Date();
    let scheduledDate = new Date(data.scheduledAt);
    const minDate = new Date(now.getTime() + 5000);

    if (scheduledDate < minDate) {
      scheduledDate = minDate;
    }

    const session = await prisma.waSession.findFirst({ where: { userId } });
    if (!session) return reply.status(400).send({ error: "Conecte o WhatsApp primeiro" });

    const msg = await prisma.scheduledMessage.create({
      data: {
        userId,
        sessionId: session.id,
        targetJid: data.targetJid,
        mode: data.mode,
        message: data.message,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        scheduledAtTz: scheduledDate,
        status: "pending",
      },
    });

    const delay = scheduledDate.getTime() - now.getTime();
    await messageQueue.add(
      `msg_${msg.id}`,
      { userId, messageId: msg.id },
      { delay: Math.max(0, delay) }
    );

    return { ok: true, message: msg };
  });

  app.post("/messages/send-now", async (request, reply) => {
    const body = request.body as any;
    // Force +5s by setting scheduledAt to now
    return app.inject({
      method: "POST",
      url: "/messages/schedule",
      payload: {
        ...body,
        scheduledAt: new Date().toISOString()
      },
      headers: request.headers
    });
  });

  app.post("/messages/batch", async (request, reply) => {
    const userId = (request.user as any).sub;
    const schema = z.object({
      items: z.array(z.object({
        targetJid: z.string(),
        message: z.string().optional(),
        mode: z.enum(["text", "file", "file_text"]),
      })),
      scheduledAt: z.string(),
    });

    const { items, scheduledAt } = schema.parse(request.body);
    const batchId = Math.random().toString(36).substring(7);
    
    const results = [];
    for (const item of items) {
      // Reuse schedule logic for each item in batch
      const res = await app.inject({
        method: "POST",
        url: "/messages/schedule",
        payload: {
          ...item,
          scheduledAt,
          batchId
        },
        headers: request.headers
      });
      results.push(res.json());
    }

    return { ok: true, batchId, results };
  });
}
