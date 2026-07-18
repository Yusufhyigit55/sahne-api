import { createRemoteJWKSet, jwtVerify } from "jose";

// Apple'ın public key'leri (identity token'ı doğrulamak için)
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

// iOS uygulaman için "audience" = bundle identifier
const APPLE_AUDIENCE = "com.sahnelabs.storykind";

export type AppleTokenPayload = {
  sub: string; // Apple'ın kullanıcı için verdiği benzersiz ID
  email?: string;
  email_verified?: boolean | string;
};

/**
 * Apple identity token'ını doğrular.
 * Geçerliyse payload döner (sub = Apple user id, email varsa email).
 * Geçersizse hata fırlatır.
 */
export async function verifyAppleToken(
  identityToken: string
): Promise<AppleTokenPayload> {
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: APPLE_AUDIENCE,
  });

  if (!payload.sub) {
    throw new Error("Apple token: sub eksik");
  }

  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email) : undefined,
    email_verified: payload.email_verified as boolean | string | undefined,
  };
}