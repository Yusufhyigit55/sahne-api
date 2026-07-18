import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { signAccessToken, signRefreshToken } from "@/lib/auth";
import { isCodeValid } from "@/lib/verificationCode";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = body ?? {};

    if (!email || !code) {
      return NextResponse.json(
        { error: "E-posta ve kod gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    // Doğrulama alanlarını select ile çekiyoruz (normalde gizli)
    const user = await User.findOne({ email: String(email).toLowerCase() }).select(
      "+verificationCode +verificationCodeExpires"
    );

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "E-posta zaten doğrulanmış" },
        { status: 409 }
      );
    }

    const valid = isCodeValid(
      user.verificationCode,
      user.verificationCodeExpires,
      String(code).trim()
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Kod geçersiz veya süresi dolmuş" },
        { status: 400 }
      );
    }

    // Doğrulandı — kodu temizle, verified yap
    user.emailVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

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
    console.error("Doğrulama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}