import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { WatchRecord, EpisodeWatch } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getTvDetail, getSeason, IMG } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: true, items: [] });
    }

    await connectDB();

    // 1) İzlemekte olan diziler
    const records = await WatchRecord.find({
      userId: auth.userId,
      status: { $in: ["watching", "up_to_date"] },
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate("contentId")
      .lean();

    const series = (records as any[]).filter(
      (r) => r.contentId && r.contentId.type === "series"
    );

    if (series.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const contentIds = series.map((r) => r.contentId._id);

    // 2) TEK SORGUDA tüm izlenen bölümler
    const allWatched = await EpisodeWatch.find({
      userId: auth.userId,
      contentId: { $in: contentIds },
    })
      .select("contentId season episode")
      .lean();

    // İçeriğe göre grupla
    const byContent = new Map<string, { season: number; episode: number }[]>();

    for (const w of allWatched as any[]) {
      const cid = w.contentId.toString();
      if (!byContent.has(cid)) byContent.set(cid, []);
      byContent.get(cid)!.push({ season: w.season, episode: w.episode });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 3) Her dizi için sıradaki bölümü PARALEL hesapla
    const results = await Promise.all(
      series.map(async (rec) => {
        const content = rec.contentId;
        const cid = content._id.toString();
        const watched = byContent.get(cid) ?? [];

        if (watched.length === 0) return null;

        // En son izlenen bölüm
        const sorted = [...watched].sort((a, b) => {
          if (a.season !== b.season) return b.season - a.season;
          return b.episode - a.episode;
        });

        const last = sorted[0];

        try {
          // TMDB çağrıları — önbellekli
          const [detail, seasonData] = await Promise.all([
            getTvDetail(content.tmdbId),
            getSeason(content.tmdbId, last.season),
          ]);

          const episodes = seasonData.episodes ?? [];

          let nextSeason = last.season;
          let nextEpisode = last.episode + 1;

          const hasNextInSeason = episodes.some(
            (e: any) => e.episode_number === nextEpisode
          );

          if (!hasNextInSeason) {
            nextSeason = last.season + 1;
            nextEpisode = 1;
          }

          const seasonExists = (detail.seasons ?? []).some(
            (s: any) => s.season_number === nextSeason
          );

          if (!seasonExists) return null;

          const nextSeasonData =
            nextSeason === last.season
              ? seasonData
              : await getSeason(content.tmdbId, nextSeason);

          const nextEp = (nextSeasonData.episodes ?? []).find(
            (e: any) => e.episode_number === nextEpisode
          );

          if (!nextEp) return null;
          if (!nextEp.air_date || nextEp.air_date > today) return null;

          const totalEp = content.totalEpisodes ?? 0;
          const progress =
            totalEp > 0 ? Math.round((watched.length / totalEp) * 100) : 0;

          return {
            tmdbId: content.tmdbId,
            titleTr: content.titleTr,
            poster: IMG.poster(content.posterPath),
            season: nextSeason,
            episode: nextEpisode,
            episodeName: nextEp.name,
            runtime: nextEp.runtime ?? null,
            watchedEpisodes: watched.length,
            totalEpisodes: totalEp,
            progress,
          };
        } catch {
          return null;
        }
      })
    );

    const items = results.filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Devam et hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}