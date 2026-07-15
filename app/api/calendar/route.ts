// app/api/calendar/route.ts : Kullanıcının izlediği/favori/tamamladığı dizilerin yaklaşan bölümlerini TMDB'den toplayıp tarihe göre sıralar.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { WatchRecord, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getTvDetail } from "@/lib/tmdb";
import { cacheGet, cacheSet } from "@/lib/cache";

/** Aktif takip edilen dizilerin sıradaki bölümlerini döner (tarihe göre sıralı). */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // Kullanıcı bazlı 30 dk önbellek
    const cacheKey = `calendar:${auth.userId}`;
    const hit = cacheGet<any>(cacheKey);
    if (hit) {
      return NextResponse.json({ ok: true, episodes: hit });
    }

    await connectDB();

    // İzlenen / favori / tamamlanan dizi kayıtları
    const records = await WatchRecord.find({
      userId: auth.userId,
      $or: [
        { status: { $in: ["watching", "up_to_date", "completed"] } },
        { isFavorite: true },
      ],
    })
      .select("contentId")
      .lean();

    if (records.length === 0) {
      cacheSet(cacheKey, [], 1800);
      return NextResponse.json({ ok: true, episodes: [] });
    }

    const contentIds = records.map((r: any) => r.contentId);

    // Sadece dizileri al (film/kitap elenir)
    const contents = await Content.find({
      _id: { $in: contentIds },
      type: "series",
    })
      .select("tmdbId titleTr posterPath")
      .lean();

    // Her dizi için TMDB'den sıradaki bölümü çek (paralel)
    const results = await Promise.all(
      contents.map(async (c: any) => {
        try {
          const detail = await getTvDetail(c.tmdbId);
          const next = detail.next_episode_to_air;

          // Yaklaşan bölümü yoksa (bitmiş dizi) ele
          if (!next || !next.air_date) return null;

          return {
            tmdbId: c.tmdbId,
            title: c.titleTr,
            poster: c.posterPath
              ? `https://image.tmdb.org/t/p/w200${c.posterPath}`
              : null,
            season: next.season_number,
            episode: next.episode_number,
            episodeName: next.name ?? null,
            airDate: next.air_date, // "2026-07-21"
          };
        } catch {
          return null; // TMDB hatası olursa o diziyi atla
        }
      })
    );

    // Null'ları ele, tarihe göre sırala (en yakın önce)
    const episodes = results
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => a.airDate.localeCompare(b.airDate));

    cacheSet(cacheKey, episodes, 1800); // 30 dk

    return NextResponse.json({ ok: true, episodes });
  } catch (err) {
    console.error("Takvim hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}