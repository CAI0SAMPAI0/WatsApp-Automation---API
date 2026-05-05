import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/signup", async (request, reply) => {
    const signupSchema = z.object({
      username: z.string().min(3),
      password: z.string().min(6),
    });

    const { username, password } = signupSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return reply.status(400).send({ error: "Usuário já existe" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { username, passwordHash },
    });

    return { id: user.id, username: user.username };
  });

  app.post("/auth/login", async (request, reply) => {
    const loginSchema = z.object({
      username: z.string(),
      password: z.string(),
    });

    const { username, password } = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return reply.status(401).send({ error: "Credenciais inválidas" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return reply.status(401).send({ error: "Credenciais inválidas" });
    }

    const token = app.jwt.sign({ sub: user.id, username: user.username });

    return { token, user: { id: user.id, username: user.username } };
  });
}
