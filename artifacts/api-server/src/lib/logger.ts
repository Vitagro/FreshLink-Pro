import pino from "pino";

// ⚠️ Aucun "transport" pino n'est utilisé : les transports pino reposent sur des
// worker threads chargés depuis des fichiers .mjs frères (pino-worker, thread-stream-worker…).
// Dans une fonction serverless Vercel, le traceur de fichiers ne suit pas ces chemins
// calculés à l'exécution → fichiers absents → crash "A server error has occurred".
// On reste donc sur le logger pino synchrone (stdout), entièrement auto-contenu.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
});
