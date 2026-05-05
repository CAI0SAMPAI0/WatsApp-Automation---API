import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import jwt from "@fastify/jwt";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { waRoutes } from "./modules/wa/wa.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, {
  secret: process.env.JWT_SECRET || "secret"
});
await app.register(websocket);

app.get("/health", async () => ({ status: "ok" }));

await app.register(authRoutes);
await app.register(waRoutes);
await app.register(messageRoutes);

const start = async () => {
  try {
    await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 3333) });
    console.log(`Server listening on http://localhost:3333`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
