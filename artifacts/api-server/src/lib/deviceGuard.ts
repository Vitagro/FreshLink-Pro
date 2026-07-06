import { createHmac } from "crypto";

function getDeviceSecret(): string {
  const s = process.env.DEVICE_SECRET;
  if (!s) throw new Error("DEVICE_SECRET environment variable is required");
  return s;
}

export const DEVICE_COOKIE = "fl_device_token";
export const SADMIN_COOKIE = "fl_sadmin_bypass";

export function signDeviceToken(fingerprint: string, expiresIn = 7 * 86_400_000): string {
  const secret = getDeviceSecret();
  const payload = JSON.stringify({ fp: fingerprint, exp: Date.now() + expiresIn });
  const data = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyDeviceToken(token: string): string | null {
  try {
    const secret = getDeviceSecret();
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expected = createHmac("sha256", secret).update(data).digest("base64url");
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload.fp ?? null;
  } catch {
    return null;
  }
}

export function signSadminToken(userId: string, expiresIn = 30 * 86_400_000): string {
  const secret = getDeviceSecret();
  const payload = JSON.stringify({ id: userId, sadmin: true, exp: Date.now() + expiresIn });
  const data = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(data + ":sadmin").digest("base64url");
  return `${data}.${sig}`;
}

export function verifySadminToken(token: string): string | null {
  try {
    const secret = getDeviceSecret();
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expected = createHmac("sha256", secret).update(data + ":sadmin").digest("base64url");
    if (expected !== sig) return null;
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as { id?: string; sadmin?: boolean; exp?: number };
    if (!p.sadmin) return null;
    if (p.exp && p.exp < Date.now()) return null;
    return p.id ?? null;
  } catch {
    return null;
  }
}

export function requireDeviceApi(req: import("express").Request): boolean {
  const cookieVal: string = (req.cookies as Record<string, string>)?.[DEVICE_COOKIE] ?? "";
  const sadminVal: string = (req.cookies as Record<string, string>)?.[SADMIN_COOKIE] ?? "";
  if (sadminVal && verifySadminToken(sadminVal) !== null) return false;
  if (!cookieVal) return true;
  return verifyDeviceToken(cookieVal) === null;
}
