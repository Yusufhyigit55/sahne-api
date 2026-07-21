import { WatchRecord, Content, DismissedRec } from "@/models";
import { getTvDetail, getMovieDetail, IMG } from "@/lib/tmdb";
import { cached } from "@/lib/cache";

export type RecReason =
  | "similar_users"
  | "genre_match"
  | "tmdb_similar"
  | "same_cast"
  | "popular";

export type Recommendation = {
  type: "series" | "movie";
  tmdbId: number;
  titleTr: string;
  poster: string | null;
  year: string | null;
  tmdbRating: number | null;
  score: number;
  reasons: { key: RecReason; text: string }[];
};

const WEIGHTS: Record<RecReason, number> = {
  similar_users: 30,
  tmdb_similar: 30,
  genre_match: 20,
  same_cast: 10,
  popular: 10,
};

/** Sabit (genel) sebep metinleri */
const GENERIC_REASON: Record<RecReason, string> = {
  similar_users: "Senin gibi izleyenler beğendi",
  genre_match: "Sevdiğin türlerde",
  tmdb_similar: "İzlediklerine benziyor",
  same_cast: "Sevdiğin oyuncular oynuyor",
  popular: "Şu an popüler",
};

export type UserLike = {
  type: "series" | "movie";
  tmdbId: number;
  titleTr: string;
  rating: number | null;
  isFavorite: boolean;
};

/** Bir öneri adayının spesifik detayları (hangi tür/içerik/oyuncu) */
type Detail = {
  genreName?: string;
  similarTitle?: string;
  castName?: string;
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

/** Kullanıcının beğendiği içerikler */
export async function getUserLikes(userId: string): Promise<UserLike[]> {
  const records = await WatchRecord.find({
    userId,
    $or: [
      { rating: { $gte: 7 } },
      { isLiked: true },
      { isFavorite: true },
      { status: "completed" },
    ],
  })
    .populate("contentId", "type tmdbId titleTr")
    .lean();

  return (records as any[])
    .filter((r) => r.contentId?.tmdbId && r.contentId.type !== "book")
    .map((r) => {
      // Beğeni gücü: favori en güçlü, sonra yüksek puan, beğeni, sadece tamamlama en zayıf
      let weight = 1;
      if (r.isFavorite) weight = 4;
      else if (r.rating != null && r.rating >= 9) weight = 3.5;
      else if (r.rating != null && r.rating >= 7) weight = 2.5;
      else if (r.isLiked) weight = 2;
      else if (r.status === "completed") weight = 1; // bitirdi ama sinyal zayıf
      // Beğenmediyse (düşük puan / dislike) öneriye hiç girmesin
      if (r.rating != null && r.rating <= 4) weight = 0;
      if (r.isDisliked) weight = 0;

      return {
        type: r.contentId.type,
        tmdbId: r.contentId.tmdbId,
        titleTr: r.contentId.titleTr,
        rating: r.rating,
        isFavorite: r.isFavorite,
        weight,
      };
    })
    .filter((l) => l.weight > 0);
}
/** Görülmüş/gizlenmiş içerikler */
export async function getUserSeen(userId: string): Promise<Set<string>> {
  const [records, dismissed] = await Promise.all([
    WatchRecord.find({ userId }).populate("contentId", "type tmdbId").lean(),
    DismissedRec.find({ userId }).populate("contentId", "type tmdbId").lean(),
  ]);

  const seen = new Set<string>();

  for (const r of records as any[]) {
    if (r.contentId?.tmdbId) {
      seen.add(`${r.contentId.type}:${r.contentId.tmdbId}`);
    }
  }

  for (const d of dismissed as any[]) {
    if (d.contentId?.tmdbId) {
      seen.add(`${d.contentId.type}:${d.contentId.tmdbId}`);
    }
  }

  return seen;
}

/** 1) BENZER KULLANICILAR */
async function getSimilarUserRecs(
  userId: string,
  seen: Set<string>,
  likes: UserLike[]
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (likes.length < 3) return scores;

  const myContents = await Content.find({
    $or: likes.map((l) => ({ type: l.type, tmdbId: l.tmdbId })),
  })
    .select("_id")
    .lean();

  const ids = (myContents as any[]).map((c) => c._id);
  if (ids.length === 0) return scores;

  const others = await WatchRecord.aggregate([
    {
      $match: {
        contentId: { $in: ids },
        userId: { $ne: userId },
        $or: [{ rating: { $gte: 7 } }, { isLiked: true }, { isFavorite: true }],
      },
    },
    { $group: { _id: "$userId", overlap: { $sum: 1 } } },
    { $match: { overlap: { $gte: 2 } } },
    { $sort: { overlap: -1 } },
    { $limit: 50 },
  ]);

  if (others.length === 0) return scores;

  const theirLikes = await WatchRecord.find({
    userId: { $in: others.map((o) => o._id) },
    contentId: { $nin: ids },
    $or: [{ rating: { $gte: 8 } }, { isFavorite: true }],
  })
    .populate("contentId", "type tmdbId")
    .lean();

  for (const like of theirLikes as any[]) {
    const c = like.contentId;
    if (!c?.tmdbId || c.type === "book") continue;

    const key = `${c.type}:${c.tmdbId}`;
    if (seen.has(key)) continue;

    scores.set(key, (scores.get(key) ?? 0) + 1);
  }

  return scores;
}

/** 2) TÜR EŞLEŞMESİ — spesifik tür adını da taşır */
async function getGenreRecs(
  seen: Set<string>,
  likes: UserLike[],
  details: Map<string, Detail>
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (likes.length === 0) return scores;

  const genreCounts = new Map<number, number>();
  const genreNames = new Map<number, string>();

  for (const like of likes.slice(0, 15)) {
    try {
      const detail =
        like.type === "series"
          ? await getTvDetail(like.tmdbId)
          : await getMovieDetail(like.tmdbId);

      for (const g of detail.genres ?? []) {
        genreCounts.set(g.id, (genreCounts.get(g.id) ?? 0) + 1);
        if (g.name) genreNames.set(g.id, g.name);
      }
    } catch {
      continue;
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  if (topGenres.length === 0) return scores;

  const topGenreName = genreNames.get(topGenres[0]);

  for (const type of ["series", "movie"] as const) {
    try {
      const tmdbType = type === "series" ? "tv" : "movie";
      const genreKey = topGenres.join(",");

      const data = await cached(
        `discover:${tmdbType}:${genreKey}`,
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
        const key = `${type}:${item.id}`;
        if (seen.has(key)) continue;
        scores.set(key, (scores.get(key) ?? 0) + 1);

        // Spesifik tür adını sakla
        if (topGenreName) {
          const d = details.get(key) ?? {};
          d.genreName = topGenreName;
          details.set(key, d);
        }
      }
    } catch {
      continue;
    }
  }

  return scores;
}

/** 3) TMDB BENZERLİĞİ — hangi içeriğe benzediğini taşır */
async function getTmdbSimilarRecs(
  seen: Set<string>,
  likes: UserLike[],
  details: Map<string, Detail>
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  const top = [...likes]
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    })
    .slice(0, 8);

  for (const like of top) {
    try {
      const detail =
        like.type === "series"
          ? await getTvDetail(like.tmdbId)
          : await getMovieDetail(like.tmdbId);

      for (const s of detail.similar?.results ?? []) {
        const key = `${like.type}:${s.id}`;
        if (seen.has(key)) continue;
        scores.set(key, (scores.get(key) ?? 0) + 1);

        // Hangi izlediğine benzediğini sakla (ilk eşleşen)
        const d = details.get(key) ?? {};
        if (!d.similarTitle) d.similarTitle = like.titleTr;
        details.set(key, d);
      }
    } catch {
      continue;
    }
  }

  return scores;
}

/** 4) ORTAK OYUNCU — hangi oyuncuyu taşır */
async function getCastRecs(
  seen: Set<string>,
  likes: UserLike[],
  details: Map<string, Detail>
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const actorCounts = new Map<number, number>();
  const actorNames = new Map<number, string>();

  for (const like of likes.slice(0, 10)) {
    try {
      const detail =
        like.type === "series"
          ? await getTvDetail(like.tmdbId)
          : await getMovieDetail(like.tmdbId);

      for (const c of (detail.credits?.cast ?? []).slice(0, 5)) {
        actorCounts.set(c.id, (actorCounts.get(c.id) ?? 0) + 1);
        if (c.name) actorNames.set(c.id, c.name);
      }
    } catch {
      continue;
    }
  }

  const topActors = [...actorCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  for (const actorId of topActors) {
    try {
      const person = await cached(`person:${actorId}`, 3600, () =>
        tmdbFetch(`/person/${actorId}`, {
          append_to_response: "combined_credits",
        })
      );

      const credits = (person as any)?.combined_credits?.cast ?? [];
      const actorName = actorNames.get(actorId);

      for (const c of credits.slice(0, 20)) {
        const type = c.media_type === "tv" ? "series" : "movie";
        const key = `${type}:${c.id}`;

        if (seen.has(key)) continue;
        if ((c.vote_average ?? 0) < 6) continue;

        scores.set(key, (scores.get(key) ?? 0) + 1);

        // Oyuncu adını sakla
        if (actorName) {
          const d = details.get(key) ?? {};
          if (!d.castName) d.castName = actorName;
          details.set(key, d);
        }
      }
    } catch {
      continue;
    }
  }

  return scores;
}

/** 5) POPÜLERLİK */
async function getPopularRecs(seen: Set<string>): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  for (const type of ["series", "movie"] as const) {
    try {
      const tmdbType = type === "series" ? "tv" : "movie";

      const data = await cached(`trending:${tmdbType}`, 1800, () =>
        tmdbFetch(`/trending/${tmdbType}/week`)
      );

      for (const item of (data as any)?.results ?? []) {
        const key = `${type}:${item.id}`;
        if (seen.has(key)) continue;
        scores.set(key, (scores.get(key) ?? 0) + 1);
      }
    } catch {
      continue;
    }
  }

  return scores;
}

/** Normalize: en yüksek skoru 1.0 yap */
function normalize(scores: Map<string, number>): Map<string, number> {
  if (scores.size === 0) return scores;

  const max = Math.max(...scores.values());
  if (max === 0) return scores;

  const out = new Map<string, number>();
  for (const [key, val] of scores) {
    out.set(key, val / max);
  }

  return out;
}

/** Kaynak + detaya göre spesifik sebep metni üret */
function reasonText(key: RecReason, detail: Detail | undefined): string {
  if (detail) {
    if (key === "genre_match" && detail.genreName) {
      return `Sevdiğin ${detail.genreName} türünde`;
    }
    if (key === "tmdb_similar" && detail.similarTitle) {
      return `${detail.similarTitle} izleyenlere`;
    }
    if (key === "same_cast" && detail.castName) {
      return `${detail.castName} oynuyor`;
    }
  }
  return GENERIC_REASON[key];
}

/** Skor haritasından öneri nesneleri oluştur */
async function buildItems(
  entries: [string, { score: number; reasons: RecReason[] }][],
  limit: number,
  details: Map<string, Detail>
): Promise<Recommendation[]> {
  const items: Recommendation[] = [];

  for (const [key, data] of entries) {
    if (items.length >= limit) break;

    const parts = key.split(":");
    const type = parts[0] as "series" | "movie";
    const tmdbId = Number(parts[1]);

    try {
      const detail =
        type === "series"
          ? await getTvDetail(tmdbId)
          : await getMovieDetail(tmdbId);

      if ((detail.vote_average ?? 0) < 5.5) continue;
      if ((detail.vote_count ?? 0) < 50) continue;

      const uniqueReasons = [...new Set(data.reasons)].slice(0, 2);
      const itemDetail = details.get(key);

      items.push({
        type,
        tmdbId,
        titleTr: type === "series" ? detail.name : detail.title,
        poster: IMG.poster(detail.poster_path),
        year:
          (type === "series"
            ? detail.first_air_date
            : detail.release_date
          )?.slice(0, 4) ?? null,
        tmdbRating: detail.vote_average
          ? Number(detail.vote_average.toFixed(1))
          : null,
        score: Math.round(data.score),
        reasons: uniqueReasons.map((r) => ({
          key: r,
          text: reasonText(r, itemDetail),
        })),
      });
    } catch {
      continue;
    }
  }

  return items;
}

/** ANA ÖNERİ FONKSİYONU */
export async function getRecommendations(
  userId: string,
  limit = 20
): Promise<Recommendation[]> {
  const seen = await getUserSeen(userId);
  const likes = await getUserLikes(userId);

  // Spesifik detaylar (key → hangi tür/içerik/oyuncu)
  const details = new Map<string, Detail>();

  // Yeni kullanıcı — sadece popüler
  if (likes.length < 2) {
    const popular = await getPopularRecs(seen);

    const entries: [string, { score: number; reasons: RecReason[] }][] = [
      ...popular.entries(),
    ]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, val]) => [
        key,
        { score: val * 100, reasons: ["popular" as RecReason] },
      ]);

    return buildItems(entries, limit, details);
  }

  // 5 kaynaktan paralel topla
  const [similarUsers, genres, tmdbSimilar, cast, popular] = await Promise.all([
    getSimilarUserRecs(userId, seen, likes),
    getGenreRecs(seen, likes, details),
    getTmdbSimilarRecs(seen, likes, details),
    getCastRecs(seen, likes, details),
    getPopularRecs(seen),
  ]);

  const sources: Array<[Map<string, number>, RecReason]> = [
    [normalize(similarUsers), "similar_users"],
    [normalize(genres), "genre_match"],
    [normalize(tmdbSimilar), "tmdb_similar"],
    [normalize(cast), "same_cast"],
    [normalize(popular), "popular"],
  ];

  const combined = new Map<string, { score: number; reasons: RecReason[] }>();

  for (const [scores, reason] of sources) {
    const weight = WEIGHTS[reason];

    for (const [key, val] of scores) {
      const existing = combined.get(key) ?? { score: 0, reasons: [] };
      existing.score += val * weight;

      if (val >= 0.15) {
        existing.reasons.push(reason);
      }

      combined.set(key, existing);
    }
  }

  const sorted = [...combined.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit * 2);

  return buildItems(sorted, limit, details);
}