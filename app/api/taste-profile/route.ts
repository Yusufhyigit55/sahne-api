// app/api/taste-profile/route.ts : Giriş yapan kullanıcının davranışsal zevk profili içgörülerini döner.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getTasteProfile } from "@/lib/tasteProfileLogic";
import { cacheGet, cacheSet } from "@/lib/cache";

/** Kullanıcının zevk profilini getir (kendi profili). */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // Kullanıcı bazlı 10 dk önbellek
    const cacheKey = `taste:${auth.userId}`;
    const hit = cacheGet<any>(cacheKey);
    if (hit) {
      return NextResponse.json({ ok: true, ...hit });
    }

    await connectDB();

    const profile = await getTasteProfile(auth.userId);

    cacheSet(cacheKey, profile, 600); // 10 dk

    return NextResponse.json({ ok: true, ...profile });
  } catch (err) {
    console.error("Zevk profili hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}