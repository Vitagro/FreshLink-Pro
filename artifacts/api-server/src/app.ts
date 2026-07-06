import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Filet de sécurité : toute erreur non gérée renvoie du JSON (jamais une page
// HTML 500 opaque qui casse les fetch().then(r => r.json()) côté frontend, et
// évite le FUNCTION_INVOCATION_FAILED de Vercel).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error?.({ err }, "unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
});

export default app;
