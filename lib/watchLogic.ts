import { Content, EpisodeWatch, WatchRecord, User, Activity } from "@/models";
import { getTvDetail, getMovieDetail } from "@/lib/tmdb";
import { getBook } from "@/lib/books";
import { cacheGet, cacheSet } from "@/lib/cache";

type ContentType = "series" | "movie" | "book";
/**
 * TMDB dizi detayından GERÇEK yayınlanmış bölüm sayısını hesaplar.
 * last_episode_to_air = yayınlanmış son bölüm. O sezona kadarki sezonların
 * episode_count toplamı + son sezonda yayınlanan bölüm = aired.
 * "Special" (season_number 0) sezonları hariç tutar.
 */
function computeAiredEpisodes(detail: any): number {
  const last = detail.last_episode_to_air;
  if (!last || typeof last.season_number !== "number") {
    // Veri yoksa toplam bölüme düş (eski davranış)
    return detail.number_of_episodes ?? 0;
  }

  const seasons: any[] = Array.isArray(detail.seasons) ? detail.seasons : [];
  const lastSeason = last.season_number;
  const lastEp = last.episode_number ?? 0;

  let aired = 0;
  for (const s of seasons) {
    if (s.season_number == null || s.season_number === 0) continue; // özel sezon atla
    if (s.season_number < lastSeason) {
      aired += s.episode_count ?? 0;
    } else if (s.season_number === lastSeason) {
      aired += lastEp; // son yayınlanan sezonda buraya kadar yayınlandı
    }
    // lastSeason'dan büyük sezonlar henüz yayınlanmadı
  }

  return aired > 0 ? aired : detail.number_of_episodes ?? 0;
}

/** İçerik DB'de yoksa oluşturur. ÖNBELLEKLİ — aynı içerik tekrar sorgulanmaz. */
export async function ensureContent(
  type: ContentType,
  externalId: string | number,
  meta?: Record<string, any>
) {
  const cacheKey = `content:${type}:${externalId}`;

  // Önbellekte varsa DB'ye bile gitme
  const hit = cacheGet<any>(cacheKey);
  if (hit) return hit;

  const query =
    type === "book"
      ? { type, googleBooksId: String(externalId) }
      : { type, tmdbId: Number(externalId) };

  let content = await Content.findOne(query);

  if (content) {
    cacheSet(cacheKey, content, 300); // 5 dk
    return content;
  }

  let extra: Record<string, any> = {};

  if (type === "series") {
    const detail = await getTvDetail(Number(externalId));
    extra = {
      titleTr: detail.name,
      titleOriginal: detail.original_name,
      posterPath: detail.poster_path,
      year: detail.first_air_date
        ? Number(detail.first_air_date.slice(0, 4))
        : null,
      totalEpisodes: detail.number_of_episodes ?? 0,
      totalSeasons: detail.number_of_seasons ?? 0,
      airedEpisodes: computeAiredEpisodes(detail),
      isEnded: ["Ended", "Canceled"].includes(detail.status),
      genres: Array.isArray(detail.genres)
        ? detail.genres.map((g: any) => g.name).filter(Boolean)
        : [],
    };
  } else if (type === "movie") {
    const detail = await getMovieDetail(Number(externalId));
    extra = {
      titleTr: detail.title,
      titleOriginal: detail.original_title,
      posterPath: detail.poster_path,
      year: detail.release_date
        ? Number(detail.release_date.slice(0, 4))
        : null,
      runtime: detail.runtime ?? null,
      genres: Array.isArray(detail.genres)
        ? detail.genres.map((g: any) => g.name).filter(Boolean)
        : [],
    };
  } else if (type === "book") {
    const detail = await getBook(String(externalId));
    extra = {
      titleTr: detail.title,
      titleOriginal: null,
      posterPath: detail.thumbnail,
      year: detail.publishedDate
        ? Number(detail.publishedDate.slice(0, 4))
        : null,
      pageCount: detail.pageCount ?? null,
      authors: detail.authors ?? [],
    };
  }

  content = await Content.create({
    ...query,
    titleTr: meta?.titleTr ?? extra.titleTr ?? "Bilinmeyen",
    ...meta,
    ...extra,
  });

  cacheSet(cacheKey, content, 300);
  return content;
}

/** Dizi durumunu yeniden hesaplar. Manuel seçim varsa dokunmaz. */
export async function recalcSeriesStatus(userId: string, contentId: string) {
  const content = await Content.findById(contentId);
  if (!content || content.type !== "series") return null;

  const record = await WatchRecord.findOne({ userId, contentId });

  // Kullanıcı elle "askıya aldım" / "bıraktım" dediyse otomatik ezme
  if (record?.manualOverride) return record.status;

  const watched = await EpisodeWatch.countDocuments({ userId, contentId });

  // airedEpisodes eksikse (eski kayıt) TMDB'den bir kez hesapla ve kaydet (lazy migration)
  let airedEpisodes = content.airedEpisodes ?? 0;
  if (!airedEpisodes && content.tmdbId) {
    try {
      const detail = await getTvDetail(content.tmdbId);
      airedEpisodes = computeAiredEpisodes(detail);
      if (airedEpisodes > 0) {
        content.airedEpisodes = airedEpisodes;
        await content.save();
      }
    } catch {
      // TMDB erişilemezse totalEpisodes'a düşeriz
    }
  }

  // Yayınlanmış bölüm sayısı (güvenilir). Yoksa totalEpisodes'a düş.
  const aired = airedEpisodes && airedEpisodes > 0
    ? airedEpisodes
    : content.totalEpisodes ?? 0;
  const isEnded = content.isEnded ?? false;

  let status: string;

  if (watched === 0) {
    status = "watchlist";
  } else if (watched < aired) {
    status = "watching";
  } else if (isEnded) {
    status = "completed";
  } else {
    status = "up_to_date";
  }

  await WatchRecord.findOneAndUpdate(
    { userId, contentId },
    {
      $set: { status },
      $setOnInsert: { startedAt: new Date() },
    },
    { upsert: true, returnDocument: "after" }
  );

  return status;
}

/** İzlenen bölüm sayısını User.stats'a yazar (denormalize). */
export async function recalcUserStats(userId: string) {
  const episodes = await EpisodeWatch.countDocuments({ userId });

  await User.findByIdAndUpdate(userId, {
    $set: { "stats.episodesWatched": episodes },
  });
}

/** Feed'e aktivite yazar. Gizli mod açıksa isHidden:true olur. */
export async function logActivity(
  userId: string,
  type: string,
  contentId: string,
  meta: Record<string, any> = {}
) {
  const user = await User.findById(userId).select("activityHidden").lean();

  await Activity.create({
    userId,
    type,
    contentId,
    meta,
    isHidden: (user as any)?.activityHidden ?? false,
  });
}