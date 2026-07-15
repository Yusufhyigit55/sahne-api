import { NextRequest, NextResponse } from "next/server";
import {
  searchTv,
  searchMovie,
  searchPerson,
  IMG,
  type TmdbSearchItem,
} from "@/lib/tmdb";
import { searchBooks } from "@/lib/books";

type SearchType = "series" | "movie" | "book" | "person";

function normalizeTmdb(item: TmdbSearchItem, type: "series" | "movie") {
  const isSeries = type === "series";
  return {
    type,
    tmdbId: item.id,
    titleTr: isSeries ? item.name : item.title,
    titleOriginal: isSeries ? item.original_name : item.original_title,
    poster: IMG.poster(item.poster_path),
    year:
      (isSeries ? item.first_air_date : item.release_date)?.slice(0, 4) ?? null,
    tmdbRating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
    overview: item.overview ?? "",
  };
}

/** Bilinirliğe göre sırala — posteri ve puanı olanlar önce */
function sortByRelevance(items: any[]) {
  return [...items].sort((a, b) => {
    const scoreA =
      (a.poster ? 5 : 0) +
      (a.tmdbRating ? 3 : 0) +
      (a.overview?.length > 30 ? 2 : 0);
    const scoreB =
      (b.poster ? 5 : 0) +
      (b.tmdbRating ? 3 : 0) +
      (b.overview?.length > 30 ? 2 : 0);
    return scoreB - scoreA;
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const type = (searchParams.get("type") ?? "series") as SearchType;
    const page = Number(searchParams.get("page") ?? 1);

    if (!q) {
      return NextResponse.json(
        { error: "Arama terimi gerekli" },
        { status: 400 }
      );
    }

    switch (type) {
      case "series": {
        const data = await searchTv(q, page);
        const results = data.results.map((i) => normalizeTmdb(i, "series"));
        return NextResponse.json({
          ok: true,
          type,
          results: sortByRelevance(results),
          totalPages: data.total_pages,
        });
      }

      case "movie": {
        const data = await searchMovie(q, page);
        const results = data.results.map((i) => normalizeTmdb(i, "movie"));
        return NextResponse.json({
          ok: true,
          type,
          results: sortByRelevance(results),
          totalPages: data.total_pages,
        });
      }

      case "book": {
        // searchBooks zaten bilinirliğe göre sıralı döner
        const books = await searchBooks(q, page);
        return NextResponse.json({
          ok: true,
          type,
          results: books.map((b) => ({
            type: "book",
            googleBooksId: b.id,
            titleTr: b.title,
            titleOriginal: b.title,
            poster: b.thumbnail,
            year: b.publishedDate?.slice(0, 4) ?? null,
            authors: b.authors,
            pageCount: b.pageCount,
            overview: b.description ?? "",
          })),
        });
      }

      case "person": {
        const data = await searchPerson(q, page);
        // Popülerliğe göre sırala
        const sorted = [...data.results].sort(
          (a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0)
        );
        return NextResponse.json({
          ok: true,
          type,
          results: sorted.map((p) => ({
            type: "person",
            tmdbId: p.id,
            name: p.name,
            photo: IMG.profile(p.profile_path ?? null),
          })),
          totalPages: data.total_pages,
        });
      }

      default:
        return NextResponse.json({ error: "Geçersiz tür" }, { status: 400 });
    }
  } catch (err) {
    console.error("Arama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}