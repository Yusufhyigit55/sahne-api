import { NextRequest, NextResponse } from "next/server";
import { getSeason, IMG } from "@/lib/tmdb";
import { connectDB } from "@/lib/db";
import { Content, EpisodeWatch } from "@/models";
import { getAuthUser } from "@/lib/auth";

type Params = { params: Promise<{ type: string; id: string; num: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { type, id, num } = await params;

    if (type !== "series") {
      return NextResponse.json(
        { error: "Sezon yalnızca diziler için geçerli" },
        { status: 400 }
      );
    }

    const tmdbId = Number(id);
    const seasonNumber = Number(num);

    const season = await getSeason(tmdbId, seasonNumber);

    // Kullanıcı giriş yapmışsa izlediği bölümleri getir
    const auth = getAuthUser(req);
    let watchedSet = new Set<number>();

    if (auth) {
      await connectDB();
      const content = await Content.findOne({ type: "series", tmdbId }).lean();

      if (content) {
        const watched = await EpisodeWatch.find({
          userId: auth.userId,
          contentId: content._id,
          season: seasonNumber,
        })
          .select("episode")
          .lean();

        watchedSet = new Set(watched.map((w: any) => w.episode));
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    return NextResponse.json({
      ok: true,
      seasonNumber,
      name: season.name,
      overview: season.overview ?? "",
      poster: IMG.poster(season.poster_path),
      episodes: (season.episodes ?? []).map((e: any) => ({
        episode: e.episode_number,
        name: e.name,
        overview: e.overview ?? "",
        airDate: e.air_date,
        runtime: e.runtime ?? null,
        still: IMG.still(e.still_path),
        rating: e.vote_average ? Number(e.vote_average.toFixed(1)) : null,
        watched: watchedSet.has(e.episode_number),
        // Gelecek bölümler işaretlenemez
        isAired: e.air_date ? e.air_date <= today : false,
      })),
    });
  } catch (err) {
    console.error("Sezon hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}