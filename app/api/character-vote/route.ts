import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, CharacterVote, EpisodeWatch, WatchRecord } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent, logActivity } from "@/lib/watchLogic";

/** Dizi veya filmin favori karakterini seç */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { type, tmdbId, characterId, characterName, actorName } =
      await req.json();

    if (!type || !tmdbId || !characterId) {
      return NextResponse.json(
        { error: "type, tmdbId ve characterId gerekli" },
        { status: 400 }
      );
    }

    if (!["series", "movie"].includes(type)) {
      return NextResponse.json({ error: "Geçersiz tür" }, { status: 400 });
    }

    await connectDB();

    const content = await ensureContent(type, tmdbId);

    // KURAL: Dizide en az bir bölüm, filmde izlemiş olmalı
    if (type === "series") {
      const watchedCount = await EpisodeWatch.countDocuments({
        userId: auth.userId,
        contentId: content._id,
      });

      if (watchedCount === 0) {
        return NextResponse.json(
          { error: "Önce diziyi izlemeye başla" },
          { status: 403 }
        );
      }
    } else {
      const record = await WatchRecord.findOne({
        userId: auth.userId,
        contentId: content._id,
        status: "completed",
      });

      if (!record) {
        return NextResponse.json(
          { error: "Önce filmi izledi olarak işaretle" },
          { status: 403 }
        );
      }
    }

    const existing = await CharacterVote.findOne({
      userId: auth.userId,
      contentId: content._id,
      scope: type,
      season: null,
      episode: null,
    });

    // Aynı karaktere tekrar oy → geri al
    if (existing && existing.characterId === characterId) {
      await CharacterVote.deleteOne({ _id: existing._id });
      return NextResponse.json({ ok: true, characterId: null });
    }

    await CharacterVote.findOneAndUpdate(
      {
        userId: auth.userId,
        contentId: content._id,
        scope: type,
        season: null,
        episode: null,
      },
      {
        $set: {
          characterId,
          characterName: characterName ?? "",
          actorName: actorName ?? "",
        },
      },
      { upsert: true }
    );

    if (!existing) {
      await logActivity(
        auth.userId,
        "voted_character",
        content._id.toString(),
        { title: content.titleTr, characterName }
      );
    }

    return NextResponse.json({ ok: true, characterId });
  } catch (err) {
    console.error("Karakter oyu hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Topluluk sonuçları + kullanıcının oyu */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const tmdbId = searchParams.get("tmdbId");

    if (!type || !tmdbId) {
      return NextResponse.json(
        { error: "type ve tmdbId gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const content = await Content.findOne({
      type,
      tmdbId: Number(tmdbId),
    }).lean();

    if (!content) {
      return NextResponse.json({ ok: true, myVote: null, stats: [] });
    }

    const auth = getAuthUser(req);

    let myVote = null;
    if (auth) {
      const vote = await CharacterVote.findOne({
        userId: auth.userId,
        contentId: content._id,
        scope: type,
        season: null,
      }).lean();
      myVote = vote ? (vote as any).characterId : null;
    }

    const all = await CharacterVote.find({
      contentId: content._id,
      scope: type,
      season: null,
    }).lean();

    const counts: Record<number, { count: number; name: string; actor: string }> =
      {};

    for (const v of all as any[]) {
      if (!counts[v.characterId]) {
        counts[v.characterId] = {
          count: 0,
          name: v.characterName,
          actor: v.actorName,
        };
      }
      counts[v.characterId].count++;
    }

    const total = all.length;
    const stats = Object.entries(counts)
      .map(([id, c]) => ({
        characterId: Number(id),
        characterName: c.name,
        actorName: c.actor,
        count: c.count,
        percent: total ? Math.round((c.count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ ok: true, myVote, stats, totalVotes: total });
  } catch (err) {
    console.error("Karakter oyu sorgu hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}