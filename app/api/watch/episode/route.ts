import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EpisodeWatch, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { notifyFollowers } from "@/lib/notify";
import {
  ensureContent,
  recalcSeriesStatus,
  recalcUserStats,
  logActivity,
} from "@/lib/watchLogic";
import { getSeason } from "@/lib/tmdb";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { tmdbId, season, episode, watchedAt, isApproximate } =
      await req.json();

    if (!tmdbId || !season || !episode) {
      return NextResponse.json(
        { error: "tmdbId, season ve episode gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    // Gelecek bölüm kontrolü — SUNUCUDA yapılır, frontend'e güvenilmez
    const seasonData = await getSeason(Number(tmdbId), Number(season));
    const ep = seasonData.episodes?.find(
      (e: any) => e.episode_number === Number(episode)
    );

    if (!ep) {
      return NextResponse.json({ error: "Bölüm bulunamadı" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (!ep.air_date || ep.air_date > today) {
      return NextResponse.json(
        { error: "Henüz yayınlanmamış bölüm işaretlenemez" },
        { status: 400 }
      );
    }

    const content = await ensureContent("series", tmdbId);
    const cid = content._id.toString();

    const existing = await EpisodeWatch.findOne({
      userId: auth.userId,
      contentId: content._id,
      season,
      episode,
    });

    // ---- Geri al ----
    if (existing) {
      await EpisodeWatch.deleteOne({ _id: existing._id });
      const status = await recalcSeriesStatus(auth.userId, cid);
      await recalcUserStats(auth.userId);

      const totalWatched = await EpisodeWatch.countDocuments({
        userId: auth.userId,
        contentId: content._id,
      });

      return NextResponse.json({
        ok: true,
        watched: false,
        status,
        totalWatched,
        totalEpisodes: content.totalEpisodes,
      });
    }

    // ---- İşaretle ----
    await EpisodeWatch.create({
      userId: auth.userId,
      contentId: content._id,
      season,
      episode,
      watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
      isApproximateDate: !!isApproximate,
    });

    const totalWatched = await EpisodeWatch.countDocuments({
      userId: auth.userId,
      contentId: content._id,
    });

    // İlk bölüm → "diziye başladı"
    if (totalWatched === 1) {
      await Content.findByIdAndUpdate(content._id, {
        $inc: { addedByCount: 1 },
      });
      await logActivity(auth.userId, "started_series", cid, {
        title: content.titleTr,
      });
    }

    const status = await recalcSeriesStatus(auth.userId, cid);
    await recalcUserStats(auth.userId);

    // Dizi bitti → "diziyi tamamladı"
    if (status === "completed") {
      await logActivity(auth.userId, "completed_series", cid, {
        title: content.titleTr,
      });
      // Takipçilere "arkadaşın diziyi bitirdi" bildirimi
      await notifyFollowers({
        actorId: auth.userId,
        type: "friend_watched",
        contentId: cid,
        message: content.titleTr ?? "",
      });
    }

    return NextResponse.json({
      ok: true,
      watched: true,
      status,
      totalWatched,
      totalEpisodes: content.totalEpisodes,
    });
  } catch (err) {
    console.error("Bölüm işaretleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}