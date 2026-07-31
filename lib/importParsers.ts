import type { ImportItem, ImportStatus } from "@/lib/importLogic";

/**
 * KAYNAK PARSER'LARI
 * Her parser, kaynağın ham dosyasını (CSV metni veya JSON) alıp
 * ortak ImportItem[] formatına çevirir. Eşleştirme burada YAPILMAZ —
 * o iş importLogic.resolveAndImport()'ta.
 */

// ---- Basit CSV ayrıştırıcı (tırnak içi virgülleri korur) ----
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function toYear(v: string | undefined): number | null {
  if (!v) return null;
  const y = Number(String(v).slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

/**
 * LETTERBOXD (film)
 * Dışa aktarım ZIP'i içinde watched.csv / ratings.csv verir.
 * Sütunlar: Date, Name, Year, Letterboxd URI, Rating (0.5-5, ratings.csv'de)
 * Rating 5'lik → 10'luk ölçeğe çevrilir (x2).
 */
export function parseLetterboxd(csvText: string): ImportItem[] {
  const rows = parseCsv(csvText);
  const items: ImportItem[] = [];

  for (const row of rows) {
    const title = row["name"] || row["title"] || "";
    if (!title) continue;

    const rating5 = row["rating"] ? Number(row["rating"]) : null;
    const rating10 =
      rating5 != null && Number.isFinite(rating5)
        ? Math.round(rating5 * 2)
        : null;

    items.push({
      type: "movie",
      title,
      year: toYear(row["year"]),
      rating: rating10,
      watchedAt: row["date"] || row["watched date"] || null,
      status: "completed",
    });
  }

  return items;
}

/**
 * TRAKT (dizi + film)
 * Trakt JSON export'u ya da CSV verebilir. Burada JSON dizisini bekliyoruz:
 * [{ type: "movie"|"show", title, year, ids: { tmdb }, rating }, ...]
 * tmdb id genelde vardır → kesin eşleşir.
 */
export function parseTrakt(jsonText: string): ImportItem[] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }

  // Trakt farklı sarmalamalar kullanabilir; olası dizileri düzleştir
  const arr: any[] = Array.isArray(data)
    ? data
    : data.watched || data.movies || data.shows || data.items || [];

  const items: ImportItem[] = [];

  for (const entry of arr) {
    // Trakt: { movie: {...} } veya { show: {...} } veya doğrudan {...}
    const node = entry.movie || entry.show || entry;
    if (!node) continue;

    const isShow = !!entry.show || node.type === "show" || node.type === "series";
    const tmdbId = node.ids?.tmdb ?? node.tmdbId ?? null;
    const title = node.title || "";
    if (!title && !tmdbId) continue;

    const ratingRaw = entry.rating ?? node.rating ?? null; // Trakt 1-10
    const rating =
      ratingRaw != null && Number.isFinite(Number(ratingRaw))
        ? Math.round(Number(ratingRaw))
        : null;

    items.push({
      type: isShow ? "series" : "movie",
      tmdbId: tmdbId ? Number(tmdbId) : null,
      title,
      year: node.year ? Number(node.year) : null,
      rating,
      watchedAt: entry.watched_at || entry.last_watched_at || null,
      status: "completed",
    });
  }

  return items;
}

/**
 * TRACKS JSON (kendi export'umuz)
 * Bizim /api/user/export çıktısı. watchRecords içinde contentId populate'li
 * (tmdbId + type + titleTr + year gömülü). Eşleştirme gerekmez.
 */
export function parseTracksJson(jsonText: string): ImportItem[] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const records: any[] = data.watchRecords || [];
  const items: ImportItem[] = [];

  for (const rec of records) {
    const c = rec.contentId;
    if (!c || typeof c !== "object") continue;
    if (c.type !== "movie" && c.type !== "series") continue; // kitap ayrı ele alınmalı

    items.push({
      type: c.type,
      tmdbId: c.tmdbId ?? null,
      title: c.titleTr || c.titleOriginal || "",
      year: c.year ?? null,
      rating: rec.rating ?? null,
      isFavorite: rec.isFavorite ?? false,
      watchedAt: rec.watchedAt ?? null,
      status: (rec.status as ImportStatus) ?? "completed",
    });
  }

  return items;
}
/**
 * TV TIME (dizi + film)
 * TV Time CSV export'u. Sütunlar:
 * type, media_type, tmdb_id, imdb_id, tvdb_id, title, year, season, episode, watched_at, rating, review
 * media_type: "episode" (dizi bölümü) | "movie" (film). Bölüm satırları dizi bazında tekilleştirilir.
 * tmdb_id genelde boş → eşleştirme title+year ile importLogic'te yapılır.
 */
export function parseTVTime(csvText: string): ImportItem[] {
  const rows = parseCsv(csvText);

  // Filmler: direkt tekil kayıt. Diziler: bölümleri grupla.
  const movies = new Map<string, ImportItem>();
  const seriesMap = new Map<
    string,
    {
      title: string;
      year: number | null;
      tmdbId: number | null;
      rating: number | null;
      watchedAt: string | null;
      episodes: { season: number; episode: number }[];
    }
  >();

  for (const row of rows) {
    const title = (row["title"] || "").trim();
    if (!title) continue;

    const mediaType = (row["media_type"] || "").toLowerCase();
    const tmdbId = row["tmdb_id"] ? Number(row["tmdb_id"]) : null;
    const validTmdb = tmdbId && Number.isFinite(tmdbId) ? tmdbId : null;
    const rawRating = row["rating"] ? Number(row["rating"]) : null;
    const rating =
      rawRating != null && Number.isFinite(rawRating) && rawRating > 0
        ? Math.round(rawRating)
        : null;
    const year = toYear(row["year"]);
    const watchedAt = row["watched_at"] || null;

    if (mediaType === "movie") {
      // Film: izlendiyse direkt completed
      const key = title.toLowerCase();
      if (!movies.has(key)) {
        movies.set(key, {
          type: "movie",
          tmdbId: validTmdb,
          title,
          year,
          rating,
          watchedAt,
          status: "completed",
        });
      }
    } else {
      // Dizi bölümü: season/episode topla
      const season = Number(row["season"]);
      const episode = Number(row["episode"]);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;

      const key = title.toLowerCase();
      let entry = seriesMap.get(key);
      if (!entry) {
        entry = {
          title,
          year,
          tmdbId: validTmdb,
          rating: null,
          watchedAt,
          episodes: [],
        };
        seriesMap.set(key, entry);
      }
      // İzlenen bölümü ekle (mükerrer olmasın)
      if (
        !entry.episodes.some(
          (e) => e.season === season && e.episode === episode
        )
      ) {
        entry.episodes.push({ season, episode });
      }
      // Dizi puanı: satırlarda varsa ilkini al
      if (entry.rating == null && rating != null) entry.rating = rating;
    }
  }

  const items: ImportItem[] = [];

  // Filmleri ekle
  for (const m of movies.values()) items.push(m);

  // Dizileri ekle — izlenen bölümlerle, status "watching" (import bölümlere göre karar verir)
  for (const s of seriesMap.values()) {
    items.push({
      type: "series",
      tmdbId: s.tmdbId,
      title: s.title,
      year: s.year,
      rating: s.rating,
      watchedAt: s.watchedAt,
      status: "watching",
      watchedEpisodes: s.episodes,
    });
  }

  return items;

}
/** Kaynak adına göre doğru parser'ı seçer */
export function parseBySource(
  source: "letterboxd" | "trakt" | "tracks" | "tvtime",
  text: string
): ImportItem[] {
  switch (source) {
    case "letterboxd":
      return parseLetterboxd(text);
    case "trakt":
      return parseTrakt(text);
    case "tracks":
      return parseTracksJson(text);
    case "tvtime":
      return parseTVTime(text);
      default:
      return [];
  }
}