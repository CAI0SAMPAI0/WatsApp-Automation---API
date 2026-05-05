import { FastifyInstance } from "fastify";

export async function messageRoutes(app: FastifyInstance) {
  app.get("/messages", async (request, reply) => {
    return { messages: [] };
  });

  app.post("/messages/schedule", async (request, reply) => {
    return { message: "Schedule stub" };
  });

  app.post("/messages/send-now", async (request, reply) => {
    return { message: "Send now stub (normalized to +5s)" };
  });
}
