import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DismissedRec } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getRecommendations } from "@/lib/recommendLogic";
import { ensureContent } from "@/lib/watchLogic";
import { cached } from "@/lib/cache";

/** Kişiselleştirilmiş öneriler */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: true, items: [] });
    }

    await connectDB();

    // 30 dakika önbellekli — her açılışta yeniden hesaplama
    const items = await cached(
      `recs:${auth.userId}`,
      1800,
      () => getRecommendations(auth.userId, 20)
    );

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Öneri hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Öneriyi gizle — "Bunu gösterme" */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { type, tmdbId } = await req.json();

    if (!type || !tmdbId) {
      return NextResponse.json(
        { error: "type ve tmdbId gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const content = await ensureContent(type, tmdbId);

    await DismissedRec.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      { $setOnInsert: { userId: auth.userId, contentId: content._id } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Öneri gizleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}