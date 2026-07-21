import { searchMovie, searchTv } from "@/lib/tmdb";
import { ensureContent } from "@/lib/watchLogic";
import { WatchRecord, EpisodeWatch } from "@/models";

/**
 * ORTAK IMPORT ALTYAPISI
 *
 * Tüm kaynaklar (Letterboxd, Trakt, Tracks JSON) önce şu "ara-format"a çevrilir,
 * sonra bu dosyadaki resolveAndImport() hepsini aynı şekilde işler.
 *
 * Eşleştirme kuralı (kullanıcı kararı): otomatik eşleştir, EMİN OLAMADIĞINI ATLA + raporla.
 * - Film/dizi: önce tmdbId varsa onu kullan (kesin). Yoksa başlık ara, YIL ±1 tutan ilk sonucu al.
 *   Yıl tutmuyorsa ya da hiç sonuç yoksa → ATLA.
 */

export type ImportStatus =
  | "watchlist"
  | "watching"
  | "completed"
  | "dropped";

/** Kaynaklardan gelen tek bir satırın standart hâli */
export type ImportItem = {
  type: "series" | "movie";
  // Eşleştirme için: tmdbId varsa kesin eşleşir; yoksa title+year ile aranır
  tmdbId?: number | null;
  title: string;
  year?: number | null;
  // Opsiyonel kullanıcı verisi
  rating?: number | null; // 1-10 ölçeğine normalize edilmiş
  isFavorite?: boolean;
  watchedAt?: string | null; // ISO tarih
  status?: ImportStatus;
};

export type ImportReport = {
  added: number;
  skipped: number;
  failed: number;
  total: number;
  // Eşleşmeyen/atlanan satırların okunabilir listesi (kullanıcıya "şunlar aktarılamadı" demek için)
  skippedItems: { title: string; year?: number | null; reason: string }[];
};

/** Başlık normalize — büyük/küçük, boşluk, noktalama farkını yok say */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** TMDB sonucundan yıl çıkar (film: release_date, dizi: first_air_date) */
function extractYear(item: any): number | null {
  const d = item.release_date || item.first_air_date;
  if (!d || typeof d !== "string") return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** TMDB sonucundan başlık çıkar */
function extractTitle(item: any): string {
  return item.title || item.name || item.original_title || item.original_name || "";
}

/**
 * Bir ImportItem'ı TMDB'de eşleştirip tmdbId döndürür.
 * Emin olamazsa null döner (→ satır atlanır).
 */
async function resolveTmdbId(item: ImportItem): Promise<number | null> {
  // 1) tmdbId zaten varsa kesin — arama yapma
  if (item.tmdbId && Number.isFinite(item.tmdbId)) {
    return Number(item.tmdbId);
  }

  // 2) Başlıkla ara
  const title = item.title?.trim();
  if (!title) return null;

  try {
    const res =
      item.type === "movie"
        ? await searchMovie(title)
        : await searchTv(title);

    const results = res?.results ?? [];
    if (results.length === 0) return null;

    const wantTitle = norm(title);
    const wantYear = item.year ?? null;

    // Önce: başlık normalize eşit VE yıl ±1 tutan
    for (const r of results) {
      const rTitle = norm(extractTitle(r));
      const rYear = extractYear(r);
      const titleMatch = rTitle === wantTitle;
      const yearMatch =
        wantYear == null || rYear == null
          ? false
          : Math.abs(rYear - wantYear) <= 1;

      if (titleMatch && yearMatch) return r.id;
    }

    // Yıl yoksa (kaynak yıl vermemişse): başlık birebir eşleşen ilk sonucu al
    if (wantYear == null) {
      for (const r of results) {
        if (norm(extractTitle(r)) === wantTitle) return r.id;
      }
    }

    // Emin değiliz → atla
    return null;
  } catch (err) {
    console.error("TMDB eşleştirme hatası:", err);
    return null;
  }
}

/**
 * Ara-formattaki listeyi işler: eşleştirir, Content'i garanti eder,
 * WatchRecord (film/dizi) yazar. Sonuç raporunu döner.
 *
 * Not: Bölüm bazlı içe aktarma (EpisodeWatch) bu ilk sürümde YOK —
 * diziler "completed/watching" durumuyla WatchRecord olarak eklenir.
 * Trakt bölüm geçmişi ileride ayrı ele alınabilir.
 */
export async function resolveAndImport(
  userId: string,
  items: ImportItem[]
): Promise<ImportReport> {
  const report: ImportReport = {
    added: 0,
    skipped: 0,
    failed: 0,
    total: items.length,
    skippedItems: [],
  };

  for (const item of items) {
    try {
      const tmdbId = await resolveTmdbId(item);

      if (!tmdbId) {
        report.skipped++;
        report.skippedItems.push({
          title: item.title,
          year: item.year ?? null,
          reason: "TMDB'de güvenli eşleşme bulunamadı",
        });
        continue;
      }

      // Content'i garanti et (varsa bulur, yoksa TMDB'den çekip oluşturur)
      const content = await ensureContent(item.type, tmdbId);
      if (!content?._id) {
        report.failed++;
        continue;
      }

      const status: ImportStatus = item.status ?? "completed";

      // Zaten kaydı varsa üzerine yazma — sadece eksikse ekle (idempotent)
      await WatchRecord.updateOne(
        { userId, contentId: content._id },
        {
          $setOnInsert: {
            userId,
            contentId: content._id,
            status,
            rating: item.rating ?? null,
            isFavorite: item.isFavorite ?? false,
            watchedAt: item.watchedAt ? new Date(item.watchedAt) : null,
            manualOverride: true, // kullanıcının kendi verisi — otomatik ezme
          },
        },
        { upsert: true }
      );

      report.added++;
    } catch (err) {
      console.error("Import satır hatası:", err, item);
      report.failed++;
    }
  }

  return report;
}