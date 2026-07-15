import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, EpisodeReview, EpisodeWatch, REACTIONS } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent, logActivity } from "@/lib/watchLogic";

/** Bölüm değerlendirmesi kaydet */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { tmdbId, season, episode, score, reactions, favoriteCharacterId } =
      await req.json();

    if (!tmdbId || !season || !episode) {
      return NextResponse.json(
        { error: "tmdbId, season ve episode gerekli" },
        { status: 400 }
      );
    }

    if (score != null && (score < 1 || score > 5)) {
      return NextResponse.json(
        { error: "Bölüm puanı 1-5 arasında olmalı" },
        { status: 400 }
      );
    }

    if (reactions && reactions.length > 5) {
      return NextResponse.json(
        { error: "En fazla 5 tepki seçebilirsin" },
        { status: 400 }
      );
    }

    if (reactions) {
      const invalid = reactions.filter(
        (r: string) => !REACTIONS.includes(r as any)
      );
      if (invalid.length) {
        return NextResponse.json(
          { error: `Geçersiz tepki: ${invalid[0]}` },
          { status: 400 }
        );
      }
    }

    await connectDB();

    const content = await ensureContent("series", tmdbId);

    // KURAL: İzlemediğin bölümü değerlendiremezsin
    const watched = await EpisodeWatch.exists({
      userId: auth.userId,
      contentId: content._id,
      season,
      episode,
    });

    if (!watched) {
      return NextResponse.json(
        { error: "Önce bölümü izledi olarak işaretle" },
        { status: 403 }
      );
    }

    const existing = await EpisodeReview.findOne({
      userId: auth.userId,
      contentId: content._id,
      season,
      episode,
    });

    const review = await EpisodeReview.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id, season, episode },
      {
        $set: {
          score: score ?? null,
          reactions: reactions ?? [],
          favoriteCharacterId: favoriteCharacterId ?? null,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // İlk değerlendirme → feed'e yaz
    if (!existing && score) {
      await logActivity(
        auth.userId,
        "reviewed_episode",
        content._id.toString(),
        {
          title: content.titleTr,
          season,
          episode,
          score,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      review: {
        score: review.score,
        reactions: review.reactions,
        favoriteCharacterId: review.favoriteCharacterId,
      },
    });
  } catch (err) {
    console.error("Değerlendirme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Bölümün topluluk sonuçları + kullanıcının kendi değerlendirmesi */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get("tmdbId");
    const season = Number(searchParams.get("season"));
    const episode = Number(searchParams.get("episode"));

    if (!tmdbId || !season || !episode) {
      return NextResponse.json(
        { error: "tmdbId, season ve episode gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const content = await Content.findOne({
      type: "series",
      tmdbId: Number(tmdbId),
    }).lean();

    if (!content) {
      return NextResponse.json({
        ok: true,
        myReview: null,
        avgScore: null,
        totalReviews: 0,
        reactionStats: {},
        characterStats: [],
      });
    }

    const auth = getAuthUser(req);

    // Kullanıcının kendi değerlendirmesi
    let myReview = null;
    if (auth) {
      myReview = await EpisodeReview.findOne({
        userId: auth.userId,
        contentId: content._id,
        season,
        episode,
      }).lean();
    }

    // Topluluk sonuçları
    const all = await EpisodeReview.find({
      contentId: content._id,
      season,
      episode,
    }).lean();

    const scored = all.filter((r: any) => r.score != null);
    const avgScore =
      scored.length > 0
        ? Number(
            (
              scored.reduce((s: number, r: any) => s + r.score, 0) /
              scored.length
            ).toFixed(1)
          )
        : null;

    // Tepki yüzdeleri
    const reactionCounts: Record<string, number> = {};
    for (const r of all) {
      for (const reaction of (r as any).reactions ?? []) {
        reactionCounts[reaction] = (reactionCounts[reaction] ?? 0) + 1;
      }
    }

    const reactionStats: Record<string, { count: number; percent: number }> = {};
    for (const [key, count] of Object.entries(reactionCounts)) {
      reactionStats[key] = {
        count,
        percent: all.length ? Math.round((count / all.length) * 100) : 0,
      };
    }

    // Favori karakter yüzdeleri
    const charCounts: Record<number, number> = {};
    for (const r of all) {
      const cid = (r as any).favoriteCharacterId;
      if (cid) charCounts[cid] = (charCounts[cid] ?? 0) + 1;
    }

    const totalVotes = Object.values(charCounts).reduce((a, b) => a + b, 0);
    const characterStats = Object.entries(charCounts)
      .map(([id, count]) => ({
        characterId: Number(id),
        count,
        percent: totalVotes ? Math.round((count / totalVotes) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      myReview: myReview
        ? {
            score: (myReview as any).score,
            reactions: (myReview as any).reactions,
            favoriteCharacterId: (myReview as any).favoriteCharacterId,
          }
        : null,
      avgScore,
      totalReviews: all.length,
      reactionStats,
      characterStats,
    });
  } catch (err) {
    console.error("Değerlendirme sorgu hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}