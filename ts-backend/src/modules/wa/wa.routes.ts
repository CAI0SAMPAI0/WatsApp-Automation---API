import { FastifyInstance } from "fastify";

export async function waRoutes(app: FastifyInstance) {
  app.get("/wa/status", async (request, reply) => {
    return { connected: false };
  });

  app.post("/wa/connect", async (request, reply) => {
    return { message: "Connect stub" };
  });
}
