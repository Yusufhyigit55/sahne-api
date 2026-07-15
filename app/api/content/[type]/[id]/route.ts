import { NextRequest, NextResponse } from "next/server";
import {
  getTvDetail,
  getMovieDetail,
  extractProvidersTR,
  extractTrailer,
  extractCast,
  IMG,
} from "@/lib/tmdb";
import { getBook } from "@/lib/books";
import { connectDB } from "@/lib/db";
import { Content } from "@/models";

type Params = { params: Promise<{ type: string; id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { type, id } = await params;

    // ---- KİTAP ----
    if (type === "book") {
      const book = await getBook(id);

      await connectDB();
      const local = await Content.findOne({
        type: "book",
        googleBooksId: id,
      }).lean();

      return NextResponse.json({
        ok: true,
        type: "book",
        googleBooksId: book.id,
        titleTr: book.title,
        subtitle: book.subtitle,
        poster: book.thumbnail,
        year: book.publishedDate?.slice(0, 4) ?? null,
        overview: book.description ?? "",
        authors: book.authors,
        pageCount: book.pageCount ?? 0,
        categories: book.categories,
        externalRating: book.averageRating ?? null,
        appRating: local?.ratingCount
          ? Number((local.ratingSum / local.ratingCount).toFixed(1))
          : null,
        addedByCount: local?.addedByCount ?? 0,
        likeCount: local?.likeCount ?? 0,
        dislikeCount: local?.dislikeCount ?? 0,
      });
    }

    // ---- DİZİ / FİLM ----
    const tmdbId = Number(id);
    if (!tmdbId) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });
    }

    const isSeries = type === "series";
    const detail = isSeries
      ? await getTvDetail(tmdbId)
      : await getMovieDetail(tmdbId);

    await connectDB();
    const local = await Content.findOne({ type, tmdbId }).lean();

    const providers = extractProvidersTR(detail);

    return NextResponse.json({
      ok: true,
      type,
      tmdbId: detail.id,
      titleTr: isSeries ? detail.name : detail.title,
      titleOriginal: isSeries ? detail.original_name : detail.original_title,
      poster: IMG.poster(detail.poster_path),
      backdrop: IMG.backdrop(detail.backdrop_path),
      overview: detail.overview ?? "",
      year: (isSeries ? detail.first_air_date : detail.release_date)?.slice(0, 4) ?? null,
      genres: detail.genres?.map((g: any) => g.name) ?? [],
      status: detail.status,
      isEnded: isSeries
        ? ["Ended", "Canceled"].includes(detail.status)
        : true,
      country: detail.origin_country?.[0] ?? detail.production_countries?.[0]?.iso_3166_1 ?? null,
      originalLanguage: detail.original_language,

      // Dizi özel
      totalSeasons: isSeries ? detail.number_of_seasons : null,
      totalEpisodes: isSeries ? detail.number_of_episodes : null,
      seasons: isSeries
        ? detail.seasons
            ?.filter((s: any) => s.season_number > 0)
            .map((s: any) => ({
              seasonNumber: s.season_number,
              name: s.name,
              episodeCount: s.episode_count,
              poster: IMG.poster(s.poster_path),
            })) ?? []
        : null,
      nextEpisode: isSeries && detail.next_episode_to_air
        ? {
            season: detail.next_episode_to_air.season_number,
            episode: detail.next_episode_to_air.episode_number,
            airDate: detail.next_episode_to_air.air_date,
          }
        : null,

      // Film özel
      runtime: !isSeries ? detail.runtime : null,

      // Ortak
      tmdbRating: detail.vote_average
        ? Number(detail.vote_average.toFixed(1))
        : null,
      appRating: local?.ratingCount
        ? Number((local.ratingSum / local.ratingCount).toFixed(1))
        : null,
      addedByCount: local?.addedByCount ?? 0,
      likeCount: local?.likeCount ?? 0,
      dislikeCount: local?.dislikeCount ?? 0,

      // Platform — bilinmiyorsa BOŞ DİZİ (tahmin yapılmaz)
      providers: providers.map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: `https://image.tmdb.org/t/p/w92${p.logo_path}`,
      })),

      trailerKey: extractTrailer(detail),

      cast: extractCast(detail).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        photo: IMG.profile(c.profile_path),
      })),

      similar:
        detail.similar?.results?.slice(0, 10).map((s: any) => ({
          type,
          tmdbId: s.id,
          titleTr: isSeries ? s.name : s.title,
          poster: IMG.poster(s.poster_path),
        })) ?? [],
    });
  } catch (err) {
    console.error("Detay hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}