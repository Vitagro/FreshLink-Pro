import { createHmac, timingSafeEqual } from "crypto";

function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET || (process.env.DEVICE_SECRET
    ? createHmac("sha256", process.env.DEVICE_SECRET).update("freshlink:auth:v1").digest("hex") : undefined);
  if (!s) throw new Error("AUTH_SECRET environment variable is required");
  return s;
}

export function signToken(payload: object): string {
  const secret = getAuthSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const secret = getAuthSecret();
    const parts = token.split(".");
    const [data, sig] = parts;
    if (parts.length !== 2 || !data || !sig) return null;
    const expected = createHmac("sha256", secret).update(data).digest("base64url");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
