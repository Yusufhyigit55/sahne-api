import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { generateCode, codeExpiry } from "@/lib/verificationCode";
import { sendVerificationEmail } from "@/lib/mail";

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

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "E-posta zaten doğrulanmış" },
        { status: 409 }
      );
    }

    const code = generateCode();
    user.verificationCode = code;
    user.verificationCodeExpires = codeExpiry(10);
    await user.save();

    await sendVerificationEmail(user.email, code);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Kod yeniden gönderme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}