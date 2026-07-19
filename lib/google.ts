import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

/** Geçerli audience'ları runtime'da oku (build sırasında değil) */
function getValidAudiences(): string[] {
  const web = process.env.GOOGLE_WEB_CLIENT_ID;
  const ios = process.env.GOOGLE_IOS_CLIENT_ID;
  return [web, ios].filter((x): x is string => Boolean(x));
}

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
  const audiences = getValidAudiences();
  if (audiences.length === 0) {
    throw new Error("Google client ID yapılandırılmamış");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: audiences,
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