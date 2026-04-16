import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Security: trust proxy (necessário para rate limiting atrás de reverse proxy) ──
  app.set("trust proxy", 1);

  // ── Security: Helmet — headers de segurança HTTP ──────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // desactivado para não bloquear CDN/inline styles
    crossOriginEmbedderPolicy: false, // compatibilidade com iframes Manus
  }));

  // ── Security: CORS — allowlist explícita de origens confiáveis ─────────────────
  const ALLOWED_ORIGINS = [
    /\.manus\.space$/,        // domínios Manus (produção)
    /\.manus\.computer$/,     // domínios Manus (preview/dev)
    /^https?:\/\/localhost/,   // desenvolvimento local
    /^https?:\/\/127\.0\.0\.1/, // desenvolvimento local
  ];
  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requisições sem origin (server-to-server, mobile apps)
      if (!origin) return callback(null, true);
      // Verificar se a origem corresponde a algum padrão permitido
      if (ALLOWED_ORIGINS.some(pattern => pattern.test(origin))) {
        return callback(null, origin);
      }
      callback(new Error("Origem não autorizada pelo CORS"));
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }));

  // ── Security: Rate Limiting global — protecção DDoS ───────────────────────
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 120,            // máximo 120 requisições por minuto por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas requisições. Tente novamente em breve." },
  });
  app.use(globalLimiter);

  // ── Security: Rate Limiting agressivo para mutações (add/remove) ──────────
  const mutationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 15,             // máximo 15 mutações por minuto por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Limite de operações atingido. Aguarde 1 minuto." },
    // Usa o keyGenerator padrão (req.ip) que já suporta IPv6
  });
  // Aplicar rate limiting agressivo apenas a mutações tRPC
  app.use("/api/trpc/prayer.add", mutationLimiter);
  app.use("/api/trpc/prayer.remove", mutationLimiter);

  // ── Security: Limitar tamanho do payload (1MB em vez de 50MB) ─────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error }) => {
        // Security: Logar erros no servidor mas não expor stack traces ao cliente
        if (process.env.NODE_ENV === "production") {
          console.error(`[tRPC Error] ${error.code}: ${error.message}`);
          // Remover stack trace em produção
          error.stack = undefined;
        }
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
