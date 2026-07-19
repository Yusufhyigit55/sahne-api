import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body ?? {};

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token gerekli" }, { status: 400 });
    }

    await connectDB();

    await User.findByIdAndUpdate(auth.userId, {
      $set: { pushToken: token },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Push token kayıt hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}