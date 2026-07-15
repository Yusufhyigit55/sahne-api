import { NextRequest, NextResponse } from "next/server";
import { getTrending, IMG, type TmdbSearchItem } from "@/lib/tmdb";
import { getPopularBooks } from "@/lib/books";

function normalizeTmdb(item: TmdbSearchItem, type: "series" | "movie") {
  const isSeries = type === "series";
  return {
    type,
    tmdbId: item.id,
    titleTr: isSeries ? item.name : item.title,
    titleOriginal: isSeries ? item.original_name : item.original_title,
    poster: IMG.poster(item.poster_path),
    year: (isSeries ? item.first_air_date : item.release_date)?.slice(0, 4) ?? null,
    tmdbRating: item.vote_average ? Number(item.vote_average.toFixed(1)) : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "series";

    if (type === "book") {
      const books = await getPopularBooks();
      return NextResponse.json({
        ok: true,
        type,
        results: books.map((b) => ({
          type: "book",
          googleBooksId: b.id,
          titleTr: b.title,
          poster: b.thumbnail,
          year: b.publishedDate?.slice(0, 4) ?? null,
          authors: b.authors,
        })),
      });
    }

    const tmdbType = type === "movie" ? "movie" : "tv";
    const data = await getTrending(tmdbType);

    return NextResponse.json({
      ok: true,
      type,
      results: data.results.map((i) =>
        normalizeTmdb(i, type === "movie" ? "movie" : "series")
      ),
    });
  } catch (err) {
    console.error("Trending hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}