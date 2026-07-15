import { NextRequest, NextResponse } from "next/server";
import {
  Activity,
  Follow,
  Block,
  EpisodeWatch,
  WatchRecord,
} from "@/models";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { IMG } from "@/lib/tmdb";

const ACTIVITY_TEXT: Record<string, (m: any) => string> = {
  started_series: () => "diziye başladı",
  completed_series: () => "diziyi tamamladı",
  watched_movie: () => "filmi izledi",
  finished_book: () => "kitabı bitirdi",
  rated: (m) => `${m.rating}/10 puan verdi`,
  reviewed: () => "inceleme yazdı",
  episode_batch: (m) => `${m.count} bölüm izledi`,
  reviewed_episode: (m) => `S${m.season}B${m.episode} değerlendirdi`,
  voted_character: (m) => `favori karakterini seçti: ${m.characterName ?? ""}`,
  commented: () => "yorum yaptı",
  created_poll: () => "anket oluşturdu",
};

const SPOILER_TYPES = [
  "reviewed_episode",
  "completed_series",
  "voted_character",
];

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: true, items: [], hasMore: false });
    }

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? 1);
    const limit = 20;

    await connectDB();

    // 1) Takip edilenler + engellenenler — PARALEL
    const [follows, blocks] = await Promise.all([
      Follow.find({ followerId: auth.userId, status: "accepted" })
        .select("followingId")
        .lean(),
      Block.find({ userId: auth.userId }).select("targetUserId").lean(),
    ]);

    const blockedIds = new Set(
      (blocks as any[]).map((b) => b.targetUserId.toString())
    );

    const visibleIds = (follows as any[])
      .map((f) => f.followingId)
      .filter((id) => !blockedIds.has(id.toString()));

    if (visibleIds.length === 0) {
      return NextResponse.json({ ok: true, items: [], hasMore: false });
    }

    // 2) Aktiviteler + toplam — PARALEL
    const filter = { userId: { $in: visibleIds }, isHidden: false };

    const [activities, total] = await Promise.all([
      Activity.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "username displayName avatar")
        .populate("contentId", "type tmdbId googleBooksId titleTr posterPath")
        .lean(),
      Activity.countDocuments(filter),
    ]);

    const valid = (activities as any[]).filter((a) => a.contentId);

    if (valid.length === 0) {
      return NextResponse.json({ ok: true, items: [], hasMore: false });
    }

    // 3) Spoiler kontrolü için gereken tüm içerik id'leri
    const contentIds = valid.map((a) => a.contentId._id);

    // Spoiler tipindeki aktivitelerin bölüm bilgileri
    const episodeChecks = valid
      .filter((a) => SPOILER_TYPES.includes(a.type) && a.season != null)
      .map((a) => ({
        contentId: a.contentId._id,
        season: a.season,
        episode: a.episode,
      }));

    // 4) TEK SORGUDA tüm izleme kayıtlarını çek
    const [myRecords, myEpisodes] = await Promise.all([
      WatchRecord.find({
        userId: auth.userId,
        contentId: { $in: contentIds },
      })
        .select("contentId")
        .lean(),
      episodeChecks.length
        ? EpisodeWatch.find({
            userId: auth.userId,
            $or: episodeChecks,
          })
            .select("contentId season episode")
            .lean()
        : Promise.resolve([]),
    ]);

    // Hafızada hızlı arama için Set'ler
    const watchedContents = new Set(
      (myRecords as any[]).map((r) => r.contentId.toString())
    );

    const watchedEpisodes = new Set(
      (myEpisodes as any[]).map(
        (e) => `${e.contentId.toString()}:${e.season}:${e.episode}`
      )
    );

    // 5) Sonuçları oluştur — DB sorgusu YOK
    const items = valid.map((a) => {
      const content = a.contentId;
      const cid = content._id.toString();

      let viewerWatched = false;

      if (a.season != null && a.episode != null) {
        viewerWatched = watchedEpisodes.has(`${cid}:${a.season}:${a.episode}`);
      } else {
        viewerWatched = watchedContents.has(cid);
      }

      const maybeSpoiler =
        SPOILER_TYPES.includes(a.type) && !viewerWatched;

      const textFn = ACTIVITY_TEXT[a.type];

      return {
        id: a._id,
        type: a.type,
        text: textFn ? textFn(a.meta ?? {}) : a.type,
        user: {
          id: a.userId._id,
          username: a.userId.username,
          displayName: a.userId.displayName,
          avatar: a.userId.avatar,
        },
        content: {
          type: content.type,
          id: content.tmdbId ?? content.googleBooksId,
          titleTr: content.titleTr,
          poster:
            content.type === "book"
              ? content.posterPath
              : IMG.poster(content.posterPath),
        },
        meta: maybeSpoiler ? {} : a.meta ?? {},
        isSpoiler: maybeSpoiler,
        createdAt: a.createdAt,
      };
    });
    // 6) Ardışık aktiviteleri grupla (aynı kullanıcı + içerik + tip)
    const grouped: typeof items = [];

    for (const item of items) {
      const last = grouped[grouped.length - 1];

      const sameGroup =
        last &&
        last.user.id.toString() === item.user.id.toString() &&
        last.content.id === item.content.id &&
        last.content.type === item.content.type &&
        last.type === item.type &&
        !last.isSpoiler &&
        !item.isSpoiler;

      if (sameGroup) {
        // Gruba ekle: sayacı artır, en yeni zamanı koru
        (last as any).groupCount = ((last as any).groupCount ?? 1) + 1;
      } else {
        grouped.push({ ...item, groupCount: 1 } as any);
      }
    }

    return NextResponse.json({
      ok: true,
      items: grouped,
      page,
      hasMore: total > page * limit,
    });

    return NextResponse.json({
      ok: true,
      items,
      page,
      hasMore: total > page * limit,
    });
  } catch (err) {
    console.error("Feed hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}