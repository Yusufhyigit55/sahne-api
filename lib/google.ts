import { OAuth2Client } from "google-auth-library";

const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID;

if (!WEB_CLIENT_ID) {
  throw new Error(".env dosyasında GOOGLE_WEB_CLIENT_ID eksik");
}

const client = new OAuth2Client();

// Hem web hem iOS client ID'yi geçerli audience olarak kabul et
const VALID_AUDIENCES = [WEB_CLIENT_ID, IOS_CLIENT_ID].filter(
  (x): x is string => Boolean(x)
);

export type GoogleTokenPayload = {
  sub: string; // Google user id
  email?: string;
  emailVerified?: boolean;
  name?: string;
};

/**
 * Google ID token'ını doğrular.
 * Geçerliyse payload döner (sub = Google user id, email, name).
 * Geçersizse hata fırlatır.
 */
export async function verifyGoogleToken(
  idToken: string
): Promise<GoogleTokenPayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: VALID_AUDIENCES,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error("Google token: geçersiz payload");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
  };
}