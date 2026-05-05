import { FastifyInstance } from "fastify";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/signup", async (request, reply) => {
    return { message: "Signup stub" };
  });

  app.post("/auth/login", async (request, reply) => {
    return { message: "Login stub" };
  });
}
