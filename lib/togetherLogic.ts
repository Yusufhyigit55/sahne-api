// lib/togetherLogic.ts : İki kullanıcının ortak zevkine göre "birlikte ne izleyelim" önerisi üretir.
import { getUserLikes, getUserSeen } from "@/lib/recommendLogic";
import { getTvDetail, getMovieDetail, IMG } from "@/lib/tmdb";
import { cached } from "@/lib/cache";

export type TogetherItem = {
  type: "series" | "movie";
  tmdbId: number;
  titleTr: string;
  poster: string | null;
  year: string | null;
  tmdbRating: number | null;
  reason: string;
};

export type TogetherResult = {
  // İkisinin de sevdiği ortak başlıklar
  shared: TogetherItem[];
  // İkisine önerilen yeni içerikler
  recommendations: TogetherItem[];
  // Ortak zevk türleri (etiket)
  commonGenres: string[];
};

/** TMDB'ye doğrudan istek */
async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("language", "tr-TR");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
      accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Bir kullanıcının beğendiklerinden tür sayımı çıkar (TMDB'den) */
async function getGenreProfile(
  likes: { type: "series" | "movie"; tmdbId: number }[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const like of likes.slice(0, 15)) {
    try {
      const detail =
        like.type === "series"
          ? await getTvDetail(like.tmdbId)
          : await getMovieDetail(like.tmdbId);
      for (const g of detail.genres ?? []) {
        counts.set(g.id, (counts.get(g.id) ?? 0) + 1);
      }
    } catch {
      continue;
    }
  }
  return counts;
}

/** TMDB tür id → Türkçe isim eşlemesi (özet) */
const GENRE_NAMES: Record<number, string> = {
  28: "Aksiyon",
  12: "Macera",
  16: "Animasyon",
  35: "Komedi",
  80: "Suç",
  99: "Belgesel",
  18: "Dram",
  10751: "Aile",
  14: "Fantastik",
  36: "Tarih",
  27: "Korku",
  10402: "Müzik",
  9648: "Gizem",
  10749: "Romantik",
  878: "Bilim Kurgu",
  53: "Gerilim",
  10752: "Savaş",
  37: "Western",
  10759: "Aksiyon & Macera",
  10762: "Çocuk",
  10763: "Haber",
  10764: "Realite",
  10765: "Bilim Kurgu & Fantastik",
  10766: "Pembe Dizi",
  10767: "Talk Show",
  10768: "Savaş & Politika",
};

export async function getTogetherRecommendations(
  userIdA: string,
  userIdB: string,
  limit = 12
): Promise<TogetherResult> {
  // 1) İki kullanıcının beğenileri + gördükleri
  const [likesA, likesB, seenA, seenB] = await Promise.all([
    getUserLikes(userIdA),
    getUserLikes(userIdB),
    getUserSeen(userIdA),
    getUserSeen(userIdB),
  ]);

  // 2) Ortak beğeniler (ikisinin de sevdiği başlıklar)
  const keyOf = (l: { type: string; tmdbId: number }) =>
    `${l.type}:${l.tmdbId}`;
  const setB = new Set(likesB.map(keyOf));
  const sharedLikes = likesA.filter((l) => setB.has(keyOf(l)));

  // 3) Tür profilleri + ortak türler
  const [genreA, genreB] = await Promise.all([
    getGenreProfile(likesA),
    getGenreProfile(likesB),
  ]);

  const commonGenreIds = [...genreA.keys()]
    .filter((id) => genreB.has(id))
    .map((id) => ({
      id,
      score: (genreA.get(id) ?? 0) + (genreB.get(id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const commonGenres = commonGenreIds
    .map((g) => GENRE_NAMES[g.id])
    .filter(Boolean);

  // 4) İkisinin de görmediği içerik havuzu
  const seenBoth = new Set<string>([...seenA, ...seenB]);

  // 5) Ortak türlerde kaliteli öneri çek
  const recommendations: TogetherItem[] = [];

  if (commonGenreIds.length > 0) {
    const genreKey = commonGenreIds.map((g) => g.id).join(",");

    for (const type of ["series", "movie"] as const) {
      if (recommendations.length >= limit) break;
      try {
        const tmdbType = type === "series" ? "tv" : "movie";
        const data = await cached(
          `together:${tmdbType}:${genreKey}`,
          3600,
          () =>
            tmdbFetch(`/discover/${tmdbType}`, {
              with_genres: genreKey,
              sort_by: "vote_average.desc",
              "vote_count.gte": "500",
              "vote_average.gte": "7.5",
              ...(tmdbType === "tv"
                ? { "first_air_date.gte": "2010-01-01" }
                : { "primary_release_date.gte": "2010-01-01" }),
            })
        );

        for (const item of (data as any)?.results ?? []) {
          if (recommendations.length >= limit) break;
          const key = `${type}:${item.id}`;
          if (seenBoth.has(key)) continue;

          recommendations.push({
            type,
            tmdbId: item.id,
            titleTr: type === "series" ? item.name : item.title,
            poster: IMG.poster(item.poster_path),
            year:
              (type === "series"
                ? item.first_air_date
                : item.release_date
              )?.slice(0, 4) ?? null,
            tmdbRating: item.vote_average
              ? Number(item.vote_average.toFixed(1))
              : null,
            reason:
              commonGenres.length > 0
                ? `İkinizin de sevdiği ${commonGenres[0]} türünde`
                : "İkinize de uygun",
          });
        }
      } catch {
        continue;
      }
    }
  }

  // 6) Ortak beğenileri de zenginleştir (poster vб. için)
  const shared: TogetherItem[] = [];
  for (const like of sharedLikes.slice(0, 8)) {
    try {
      const detail =
        like.type === "series"
          ? await getTvDetail(like.tmdbId)
          : await getMovieDetail(like.tmdbId);

      shared.push({
        type: like.type,
        tmdbId: like.tmdbId,
        titleTr: like.type === "series" ? detail.name : detail.title,
        poster: IMG.poster(detail.poster_path),
        year:
          (like.type === "series"
            ? detail.first_air_date
            : detail.release_date
          )?.slice(0, 4) ?? null,
        tmdbRating: detail.vote_average
          ? Number(detail.vote_average.toFixed(1))
          : null,
        reason: "İkiniz de sevmiş",
      });
    } catch {
      continue;
    }
  }

  return { shared, recommendations, commonGenres };
}