import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, WatchRecord, User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent, logActivity } from "@/lib/watchLogic";
import { getMovieDetail } from "@/lib/tmdb";
import { notifyFollowers } from "@/lib/notify";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // status: "completed" | "watchlist" | "dropped"
    const { tmdbId, status, watchedAt, isApproximate, stoppedAtMinute, rating, reactions } =
      await req.json();

    if (!tmdbId) {
      return NextResponse.json({ error: "tmdbId gerekli" }, { status: 400 });
    }

    await connectDB();

    // Film bilgisini TMDB'den al (süre için)
    const detail = await getMovieDetail(Number(tmdbId));

    const content = await ensureContent("movie", tmdbId, {
      titleTr: detail.title,
      titleOriginal: detail.original_title,
      posterPath: detail.poster_path,
      year: detail.release_date
        ? Number(detail.release_date.slice(0, 4))
        : null,
      runtime: detail.runtime ?? 0,
    });

    const existing = await WatchRecord.findOne({
      userId: auth.userId,
      contentId: content._id,
    });

    // Aynı duruma tekrar basıldı → geri al
    if (existing && existing.status === status) {
      await WatchRecord.deleteOne({ _id: existing._id });

      if (status === "completed") {
        await Content.findByIdAndUpdate(content._id, {
          $inc: { addedByCount: -1 },
        });
        await User.findByIdAndUpdate(auth.userId, {
          $inc: {
            "stats.moviesWatched": -1,
            "stats.totalMinutes": -(content.runtime ?? 0),
          },
        });
      }

      return NextResponse.json({ ok: true, status: null });
    }

    const isNew = !existing;
    const wasCompleted = existing?.status === "completed";

    const record = await WatchRecord.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      {
        $set: {
          status: status ?? "completed",
          watchedAt: watchedAt ? new Date(watchedAt) : new Date(),
          isApproximateDate: !!isApproximate,
          stoppedAtMinute: stoppedAtMinute ?? null,
          manualOverride: true,
          ...(rating != null ? { rating: Number(rating) } : {}),
          ...(Array.isArray(reactions) ? { reactions } : {}),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // İstatistik güncelle
    if (status === "completed" && !wasCompleted) {
      await Content.findByIdAndUpdate(content._id, {
        $inc: { addedByCount: isNew ? 1 : 0 },
      });
      await User.findByIdAndUpdate(auth.userId, {
        $inc: {
          "stats.moviesWatched": 1,
          "stats.totalMinutes": content.runtime ?? 0,
        },
      });

      await logActivity(auth.userId, "watched_movie", content._id.toString(), {
        title: content.titleTr,
      });
      // Takipçilere "arkadaşın film bitirdi" bildirimi
      await notifyFollowers({
        actorId: auth.userId,
        type: "friend_watched",
        contentId: content._id.toString(),
        message: content.titleTr ?? "",
      });
    }

    return NextResponse.json({
      ok: true,
      status: record.status,
    });
  } catch (err) {
    console.error("Film işaretleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}