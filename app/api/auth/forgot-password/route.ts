import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { generateCode, codeExpiry } from "@/lib/verificationCode";
import { sendResetEmail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body ?? {};

    if (!email) {
      return NextResponse.json({ error: "E-posta gerekli" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ email: String(email).toLowerCase() });

    // Güvenlik: kullanıcı yoksa da başarılı gibi dön (email enumeration önlenir)
    if (!user) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const code = generateCode();
    user.resetCode = code;
    user.resetCodeExpires = codeExpiry(10);
    await user.save();

    await sendResetEmail(user.email, code);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Şifre sıfırlama isteği hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}