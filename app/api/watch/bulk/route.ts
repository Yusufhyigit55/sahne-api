import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EpisodeWatch } from "@/models";
import { getAuthUser } from "@/lib/auth";
import {
  ensureContent,
  recalcSeriesStatus,
  recalcUserStats,
  logActivity,
} from "@/lib/watchLogic";
import { getSeason, getTvDetail } from "@/lib/tmdb";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // scope: "season" | "all" | "upto" (belirli sezonda X. bölüme kadar)
    const { tmdbId, season, episode, scope, watchedAt, isApproximate } =
      await req.json();

    if (!tmdbId || !scope) {
      return NextResponse.json(
        { error: "tmdbId ve scope gerekli" },
        { status: 400 }
      );
    }

    await connectDB();
    const content = await ensureContent("series", tmdbId);
    const cid = content._id.toString();

    const today = new Date().toISOString().slice(0, 10);
    const date = watchedAt ? new Date(watchedAt) : new Date();

    let seasons: number[] = [];
    if (scope === "season" || scope === "upto") {
      if (!season) {
        return NextResponse.json({ error: "season gerekli" }, { status: 400 });
      }
      seasons = [Number(season)];
    } else {
      const detail = await getTvDetail(Number(tmdbId));
      seasons = (detail.seasons ?? [])
        .filter((s: any) => s.season_number > 0)
        .map((s: any) => s.season_number);
    }

    let added = 0;

    for (const sn of seasons) {
      const seasonData = await getSeason(Number(tmdbId), sn);

      const aired = (seasonData.episodes ?? []).filter((e: any) => {
        if (!e.air_date || e.air_date > today) return false;
        // "upto": sadece hedef bölüme kadar (ve dahil) olanları işaretle
        if (scope === "upto" && season && sn === Number(season)) {
          return e.episode_number <= Number(episode);
        }
        return true;
      });

      const docs = aired.map((e: any) => ({
        userId: auth.userId,
        contentId: content._id,
        season: sn,
        episode: e.episode_number,
        watchedAt: date,
        isApproximateDate: !!isApproximate,
      }));

      if (docs.length) {
        try {
          // ordered:false → zaten işaretli olanları atla
          const res = await EpisodeWatch.insertMany(docs, { ordered: false });
          added += res.length;
        } catch (e: any) {
          added += e?.insertedDocs?.length ?? 0;
        }
      }
    }

    const totalWatched = await EpisodeWatch.countDocuments({
      userId: auth.userId,
      contentId: content._id,
    });

    if (added > 0) {
      await logActivity(auth.userId, "episode_batch", cid, {
        title: content.titleTr,
        count: added,
        scope,
      });
    }

    const status = await recalcSeriesStatus(auth.userId, cid);
    await recalcUserStats(auth.userId);

    return NextResponse.json({
      ok: true,
      added,
      totalWatched,
      totalEpisodes: content.totalEpisodes,
      status,
    });
  } catch (err) {
    console.error("Toplu işaretleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}