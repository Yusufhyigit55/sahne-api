import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { verifyAppleToken } from "@/lib/apple";
import { signAccessToken, signRefreshToken } from "@/lib/auth";

/** Apple'dan gelen ad-soyaddan benzersiz username üretir */
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
    const { identityToken, fullName } = body ?? {};

    if (!identityToken) {
      return NextResponse.json(
        { error: "identityToken gerekli" },
        { status: 400 }
      );
    }

    // Apple token'ını doğrula
    let applePayload;
    try {
      applePayload = await verifyAppleToken(identityToken);
    } catch (e) {
      console.error("Apple token doğrulama hatası:", e);
      return NextResponse.json(
        { error: "Apple kimliği doğrulanamadı" },
        { status: 401 }
      );
    }

    const appleId = applePayload.sub;
    const email = applePayload.email ?? null;

    await connectDB();

    // 1) Bu Apple ID ile daha önce giriş yapılmış mı?
    let user = await User.findOne({ appleId });

    // 2) Yoksa, aynı email'e sahip bir hesap var mı? (varsa bağla)
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.appleId = appleId;
        if (user.authProvider === "local") {
          // mevcut local hesaba apple bağlandı
        }
        await user.save();
      }
    }

    // 3) Hiç yoksa yeni kullanıcı oluştur
    if (!user) {
      const displayName =
        (fullName?.givenName || fullName?.familyName
          ? `${fullName?.givenName ?? ""} ${fullName?.familyName ?? ""}`.trim()
          : null) ||
        (email ? email.split("@")[0] : "Kullanıcı");

      const usernameBase =
        (email ? email.split("@")[0] : displayName) || "user";
      const username = await generateUsername(usernameBase);

      user = await User.create({
        email: email ? email.toLowerCase() : `apple_${appleId}@privaterelay.local`,
        username,
        displayName,
        appleId,
        authProvider: "apple",
        emailVerified: true, // Apple email'i zaten doğrulanmış sayılır
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
    console.error("Apple giriş hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}