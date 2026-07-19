import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { verifyGoogleToken } from "@/lib/google";
import { signAccessToken, signRefreshToken } from "@/lib/auth";

/** Google'dan gelen ad/email'den benzersiz username üretir */
async function generateUsername(base: string): Promise<string> {
  let clean = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 15);
  if (clean.length < 3) clean = "user" + clean;

  let candidate = clean;
  let i = 0;
  while (await User.findOne({ username: candidate })) {
    i++;
    candidate = `${clean}${i}`;
  }
  return candidate;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { idToken } = body ?? {};

    if (!idToken) {
      return NextResponse.json({ error: "idToken gerekli" }, { status: 400 });
    }

    // Google token'ını doğrula
    let googlePayload;
    try {
      googlePayload = await verifyGoogleToken(idToken);
    } catch (e) {
      console.error("Google token doğrulama hatası:", e);
      return NextResponse.json(
        { error: "Google kimliği doğrulanamadı" },
        { status: 401 }
      );
    }

    const googleId = googlePayload.sub;
    const email = googlePayload.email ?? null;

    await connectDB();

    // 1) Bu Google ID ile daha önce giriş yapılmış mı?
    let user = await User.findOne({ googleId });

    // 2) Yoksa, aynı email'e sahip hesap var mı? (varsa bağla)
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.googleId = googleId;
        await user.save();
      }
    }

    // 3) Hiç yoksa yeni kullanıcı oluştur
    if (!user) {
      const displayName =
        googlePayload.name ||
        (email ? email.split("@")[0] : "Kullanıcı");

      const usernameBase = email ? email.split("@")[0] : displayName;
      const username = await generateUsername(usernameBase);

      user = await User.create({
        email: email
          ? email.toLowerCase()
          : `google_${googleId}@noemail.local`,
        username,
        displayName,
        googleId,
        authProvider: "google",
        emailVerified: true,
        acceptedTerms: true,
        acceptedPrivacy: true,
      });
    }

    const payload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    return NextResponse.json(
      {
        ok: true,
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        user: {
          id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          onboarded: user.onboarded,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Google giriş hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}