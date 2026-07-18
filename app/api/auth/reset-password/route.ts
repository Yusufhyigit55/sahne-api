import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { hashPassword } from "@/lib/auth";
import { isCodeValid } from "@/lib/verificationCode";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code, newPassword } = body ?? {};

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { error: "E-posta, kod ve yeni şifre gerekli" },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 8) {
      return NextResponse.json(
        { error: "Şifre en az 8 karakter olmalı" },
        { status: 400 }
      );
    }

    await connectDB();

    // Sıfırlama alanlarını select ile çekiyoruz (normalde gizli)
    const user = await User.findOne({
      email: String(email).toLowerCase(),
    }).select("+resetCode +resetCodeExpires +password");

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const valid = isCodeValid(
      user.resetCode,
      user.resetCodeExpires,
      String(code).trim()
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Kod geçersiz veya süresi dolmuş" },
        { status: 400 }
      );
    }

    // Yeni şifreyi kaydet, kodu temizle
    user.password = await hashPassword(String(newPassword));
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    return NextResponse.json(
      { ok: true, message: "Şifren başarıyla güncellendi" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Şifre sıfırlama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}