import app from "./app";
import { logger } from "./lib/logger";

// Default to 3000 when unset: some hosts (e.g. LiteSpeed/Passenger-style
// lsnode) spawn the app without ever setting PORT and instead proxy to a
// fixed/expected port.
const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
