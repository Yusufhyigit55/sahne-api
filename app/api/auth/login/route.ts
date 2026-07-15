import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, Ban } from "@/models";
import { comparePassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { emailOrUsername, password } = parsed.data;

    await connectDB();

    const query = emailOrUsername.includes("@")
      ? { email: emailOrUsername.toLowerCase() }
      : { username: emailOrUsername.toLowerCase() };

    // password alanı select:false olduğu için açıkça istiyoruz
    const user = await User.findOne(query).select("+password");

    if (!user) {
      return NextResponse.json(
        { error: "E-posta/kullanıcı adı veya şifre hatalı" },
        { status: 401 }
      );
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "E-posta/kullanıcı adı veya şifre hatalı" },
        { status: 401 }
      );
    }

    // Aktif ban var mı? (giriş engellenmiyor, sadece bilgi)
    const activeBan = await Ban.findOne({
      userId: user._id,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    const payload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    return NextResponse.json({
      ok: true,
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        theme: user.theme,
        language: user.language,
      },
      ban: activeBan
        ? {
            reason: activeBan.reason,
            expiresAt: activeBan.expiresAt,
          }
        : null,
    });
  } catch (err) {
    console.error("Giriş hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}