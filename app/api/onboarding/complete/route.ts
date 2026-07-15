// app/api/onboarding/complete/route.ts : Kullanıcının onboarding akışını tamamladığını işaretler.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Onboarding'i tamamlandı olarak işaretle. */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    await User.findByIdAndUpdate(auth.userId, {
      $set: { onboarded: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Onboarding tamamlama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}