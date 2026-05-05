import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { waRoutes } from "./modules/wa/wa.routes.js";
import { messageRoutes } from "./modules/messages/messages.routes.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);

app.get("/health", async () => ({ status: "ok" }));
await app.register(authRoutes);
await app.register(waRoutes);
await app.register(messageRoutes);

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 3333) });
