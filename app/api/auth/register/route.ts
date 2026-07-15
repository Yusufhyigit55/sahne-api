import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { hashPassword, signAccessToken, signRefreshToken } from "@/lib/auth";
import { registerSchema } from "@/lib/validators/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password, username, displayName, birthDate, gender, acceptedTerms, acceptedPrivacy } =
      parsed.data;

    await connectDB();

    // 13 yaş kontrolü
    if (birthDate) {
      const age =
        (Date.now() - new Date(birthDate).getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);
      if (age < 13) {
        return NextResponse.json(
          { error: "Sahne'yi kullanmak için en az 13 yaşında olmalısınız" },
          { status: 400 }
        );
      }
    }

    // Benzersizlik kontrolü
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return NextResponse.json(
        { error: "Bu e-posta zaten kayıtlı" },
        { status: 409 }
      );
    }

    const existingUsername = await User.findOne({
      username: username.toLowerCase(),
    });
    if (existingUsername) {
      return NextResponse.json(
        { error: "Bu kullanıcı adı alınmış" },
        { status: 409 }
      );
    }

    const hashed = await hashPassword(password);

    const user = await User.create({
      email: email.toLowerCase(),
      password: hashed,
      username: username.toLowerCase(),
      displayName,
      birthDate: birthDate ? new Date(birthDate) : null,
      gender: gender ?? null,
      acceptedTerms,
      acceptedPrivacy,
    });

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
      { status: 201 }
    );
  } catch (err) {
    console.error("Kayıt hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}