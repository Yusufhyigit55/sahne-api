import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error(".env.local dosyasında JWT_SECRET veya JWT_REFRESH_SECRET eksik");
}

export type TokenPayload = {
  userId: string;
  username: string;
  role: string;
};

// ---- Şifre ----

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

// ---- Token üretme ----

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET!, { expiresIn: "30d" });
}

// ---- Token doğrulama ----

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

// ---- İstekten kullanıcıyı çıkar ----

/** Authorization header'ından token okur ve doğrular. */
export function getAuthUser(req: NextRequest): TokenPayload | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  return verifyAccessToken(token);
}

/** Giriş zorunlu olan endpoint'lerde kullanılır. */
export function requireAuth(req: NextRequest): TokenPayload {
  const user = getAuthUser(req);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}