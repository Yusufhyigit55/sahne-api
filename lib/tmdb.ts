import { cached } from "@/lib/cache";

const TMDB_TOKEN = process.env.TMDB_TOKEN;
const BASE = "https://api.themoviedb.org/3";

if (!TMDB_TOKEN) {
  throw new Error(".env.local dosyasında TMDB_TOKEN tanımlı değil");
}

export const IMG = {
  poster: (p: string | null) =>
    p ? `https://image.tmdb.org/t/p/w500${p}` : null,
  backdrop: (p: string | null) =>
    p ? `https://image.tmdb.org/t/p/w1280${p}` : null,
  profile: (p: string | null) =>
    p ? `https://image.tmdb.org/t/p/w185${p}` : null,
  still: (p: string | null) =>
    p ? `https://image.tmdb.org/t/p/w300${p}` : null,
};

async function tmdb<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("language", "tr-TR");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`TMDB hatası ${res.status}: ${path}`);
  }

  return res.json() as Promise<T>;
}

// ---- Tipler ----

export type TmdbSearchItem = {
  id: number;
  media_type: "tv" | "movie" | "person";
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  poster_path: string | null;
  profile_path?: string | null;
  first_air_date?: string;
  release_date?: string;
  vote_average?: number;
  overview?: string;
  popularity?: number;
};

export type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string;
};

export type TmdbCast = {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
};

// ---- Arama (önbelleklenmez — her arama farklı) ----

export async function searchMulti(query: string, page = 1) {
  return tmdb<{ results: TmdbSearchItem[]; total_pages: number }>(
    "/search/multi",
    { query, page: String(page) }
  );
}

export async function searchTv(query: string, page = 1) {
  return tmdb<{ results: TmdbSearchItem[]; total_pages: number }>("/search/tv", {
    query,
    page: String(page),
  });
}

export async function searchMovie(query: string, page = 1) {
  return tmdb<{ results: TmdbSearchItem[]; total_pages: number }>(
    "/search/movie",
    { query, page: String(page) }
  );
}

export async function searchPerson(query: string, page = 1) {
  return tmdb<{ results: TmdbSearchItem[]; total_pages: number }>(
    "/search/person",
    { query, page: String(page) }
  );
}

// ---- Detaylar (ÖNBELLEKLİ) ----

export async function getTvDetail(id: number) {
  return cached(`tv:${id}`, 3600, () =>
    tmdb<any>(`/tv/${id}`, {
      append_to_response:
        "credits,watch/providers,videos,similar,content_ratings",
    })
  );
}

export async function getMovieDetail(id: number) {
  return cached(`movie:${id}`, 3600, () =>
    tmdb<any>(`/movie/${id}`, {
      append_to_response: "credits,watch/providers,videos,similar,release_dates",
    })
  );
}

export async function getSeason(tvId: number, seasonNumber: number) {
  return cached(`season:${tvId}:${seasonNumber}`, 3600, () =>
    tmdb<any>(`/tv/${tvId}/season/${seasonNumber}`)
  );
}

export async function getPerson(id: number) {
  return cached(`person:${id}`, 3600, () =>
    tmdb<any>(`/person/${id}`, {
      append_to_response: "combined_credits",
    })
  );
}

export async function getTrending(type: "tv" | "movie" = "tv") {
  return cached(`trending:${type}`, 1800, () =>
    tmdb<{ results: TmdbSearchItem[] }>(`/trending/${type}/week`)
  );
}

export async function getGenres(type: "tv" | "movie") {
  return cached(`genres:${type}`, 86400, () =>
    tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`)
  );
}

// ---- Yardımcılar ----

/** Türkiye'de hangi platformlarda izlenebilir? Bilinmiyorsa boş dizi. */
export function extractProvidersTR(detail: any): TmdbProvider[] {
  const tr = detail?.["watch/providers"]?.results?.TR;
  if (!tr) return [];
  return tr.flatrate ?? [];
}

/** Fragman (YouTube anahtarı). Yoksa null. */
export function extractTrailer(detail: any): string | null {
  const videos = detail?.videos?.results ?? [];
  const trailer = videos.find(
    (v: any) => v.site === "YouTube" && v.type === "Trailer"
  );
  return trailer?.key ?? null;
}

/** Oyuncu kadrosu — ilk 20 kişi. */
export function extractCast(detail: any, limit = 20): TmdbCast[] {
  const cast = detail?.credits?.cast ?? [];
  return cast.slice(0, limit);
}