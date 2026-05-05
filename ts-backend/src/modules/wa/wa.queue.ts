import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { WhatsAppManager } from "./wa.manager.js";
import { prisma } from "../../lib/prisma.js";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const messageQueue = new Queue("messages", { connection });

const worker = new Worker(
  "messages",
  async (job) => {
    const { userId, messageId } = job.data;
    
    const task = await prisma.scheduledMessage.findUnique({
      where: { id: messageId },
      include: { waSession: true }
    });

    if (!task) return;

    try {
      await prisma.scheduledMessage.update({
        where: { id: messageId },
        data: { status: "running" }
      });

      if (task.mode === "text") {
        await WhatsAppManager.sendText(userId, task.targetJid, task.message || "");
      } else if (task.mode === "file" || task.mode === "file_text") {
        await WhatsAppManager.sendMedia(userId, task.targetJid, task.fileUrl!, task.message || undefined);
      }

      await prisma.scheduledMessage.update({
        where: { id: messageId },
        data: { status: "sent", sentAt: new Date() }
      });
    } catch (error: any) {
      console.error(`Failed to send message ${messageId}:`, error);
      await prisma.scheduledMessage.update({
        where: { id: messageId },
        data: { status: "failed", errorMessage: error.message }
      });
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
