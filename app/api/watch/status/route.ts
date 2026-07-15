import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { ensureContent } from "@/lib/watchLogic";
import { Content, WatchRecord, EpisodeWatch } from "@/models";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: true, record: null });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json(
        { error: "type ve id gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const query =
      type === "book"
        ? { type, googleBooksId: id }
        : { type, tmdbId: Number(id) };

    const content = await Content.findOne(query).lean();

    if (!content) {
      return NextResponse.json({ ok: true, record: null, watchedEpisodes: 0 });
    }

    const record = await WatchRecord.findOne({
      userId: auth.userId,
      contentId: content._id,
    }).lean();

    const watchedEpisodes =
      type === "series"
        ? await EpisodeWatch.countDocuments({
            userId: auth.userId,
            contentId: content._id,
          })
        : 0;

    return NextResponse.json({
      ok: true,
      record: record
        ? {
            status: record.status,
            rating: record.rating,
            isLiked: record.isLiked,
            isDisliked: record.isDisliked,
            isFavorite: record.isFavorite,
            isHidden: record.isHidden,
            watchedAt: record.watchedAt,
            rewatchCount: record.rewatchCount,
          }
        : null,
      watchedEpisodes,
      totalEpisodes: content.totalEpisodes ?? 0,
    });
  } catch (err) {
    console.error("Durum hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
/** Durumu elle değiştir — manualOverride:true olur, otomatik hesaplama ezmez */
export async function PATCH(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { type, id, status } = await req.json();

    const VALID = [
      "none",
      "watchlist",
      "watching",
      "up_to_date",
      "completed",
      "paused",
      "dropped",
      "reading",
    ];

    if (!type || !id || !status) {
      return NextResponse.json(
        { error: "type, id ve status gerekli" },
        { status: 400 }
      );
    }

    if (!VALID.includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }

    await connectDB();

    const content = await ensureContent(type, id);

    const record = await WatchRecord.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      {
        $set: {
          status,
          // Kullanıcı elle seçtiyse otomatik hesaplama bunu ezmesin
          manualOverride: status !== "none",
        },
        $setOnInsert: { startedAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );

    return NextResponse.json({
      ok: true,
      status: record?.status ?? null,
    });
  } catch (err) {
    console.error("Durum değiştirme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}