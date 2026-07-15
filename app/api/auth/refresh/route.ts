import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth";
import { refreshSchema } from "@/lib/validators/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Refresh token gerekli" }, { status: 400 });
    }

    const payload = verifyRefreshToken(parsed.data.refreshToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Geçersiz veya süresi dolmuş refresh token" },
        { status: 401 }
      );
    }

    await connectDB();

    // Kullanıcı hâlâ var mı? (hesap silinmiş olabilir)
    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
    }

    const fresh = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    return NextResponse.json({
      ok: true,
      accessToken: signAccessToken(fresh),
      refreshToken: signRefreshToken(fresh),
    });
  } catch (err) {
    console.error("Refresh hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}