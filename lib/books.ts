import { cached } from "@/lib/cache";

const BASE = "https://www.googleapis.com/books/v1";
const BOOKS_KEY = process.env.GOOGLE_BOOKS_KEY;

export type BookItem = {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories: string[];
  thumbnail: string | null;
  language?: string;
  averageRating?: number;
  ratingsCount?: number;
};

type GoogleVolume = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
};

function normalize(v: GoogleVolume): BookItem {
  const info = v.volumeInfo;
  const raw = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;

  return {
    id: v.id,
    title: info.title,
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    publishedDate: info.publishedDate,
    description: info.description,
    pageCount: info.pageCount,
    categories: info.categories ?? [],
    thumbnail: raw
      ? raw.replace("http://", "https://").replace("&zoom=1", "&zoom=2")
      : null,
    language: info.language,
    averageRating: info.averageRating,
    ratingsCount: info.ratingsCount,
  };
}

/** Bilinirlik puanı — kapak, sayfa sayısı, açıklama ve oy sayısına göre */
function popularityScore(b: BookItem): number {
  let score = 0;
  if (b.thumbnail) score += 5;
  if (b.pageCount && b.pageCount > 0) score += 3;
  if (b.description && b.description.length > 50) score += 2;
  if (b.authors.length > 0) score += 2;
  if (b.ratingsCount) score += Math.min(b.ratingsCount / 10, 5);
  return score;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Books'a istek. Google sık sık 503 "Service temporarily unavailable"
 * ya da 429 (rate limit) döndürüyor — bu durumlarda kısa beklemeyle 2 kez retry.
 * Tüm denemeler başarısızsa hata fırlatır (çağıran yakalar).
 */
async function books<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  if (BOOKS_KEY) {
    url.searchParams.set("key", BOOKS_KEY);
  }

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        next: { revalidate: 3600 },
      });

      // 503/429/500 → geçici hata, retry'a değer
      if (res.status === 503 || res.status === 429 || res.status === 500) {
        lastErr = new Error(`Google Books geçici hata ${res.status}`);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 400); // 400ms, 800ms
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        throw new Error(`Google Books hatası ${res.status}: ${path}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 400);
        continue;
      }
    }
  }

  throw lastErr ?? new Error("Google Books erişilemedi");
}

/**
 * Kitap ara. Türkçe öncelikli, bilinirliğe göre sıralı.
 * Google Books erişilemezse (retry sonrası bile) ÇÖKMEZ — boş dizi döner.
 * Sonuçlar 5 dk önbelleklenir (Google'a daha az gidip rate-limit'e daha az takılır).
 */
export async function searchBooks(query: string, page = 1): Promise<BookItem[]> {
  const cacheKey = `books:search:${query.toLowerCase()}:${page}`;

  try {
    return await cached(cacheKey, 300, async () => {
      const startIndex = (page - 1) * 20;

      // 1) Türkçe öncelikli
      let items: GoogleVolume[] = [];
      try {
        const data = await books<{ items?: GoogleVolume[] }>("/volumes", {
          q: query,
          maxResults: "20",
          startIndex: String(startIndex),
          langRestrict: "tr",
          orderBy: "relevance",
        });
        items = data.items ?? [];
      } catch {
        // Türkçe deneme patlarsa yut, fallback'e geç
        items = [];
      }

      // 2) Türkçe sonuç yoksa dil kısıtı olmadan tekrar dene
      if (items.length === 0) {
        const fallback = await books<{ items?: GoogleVolume[] }>("/volumes", {
          q: query,
          maxResults: "20",
          startIndex: String(startIndex),
          orderBy: "relevance",
        });
        items = fallback.items ?? [];
      }

      const normalized = items.map(normalize);
      return normalized.sort((a, b) => popularityScore(b) - popularityScore(a));
    });
  } catch (err) {
    // Google tamamen erişilemez → çökme, boş dön (kullanıcı "sonuç yok" görür)
    console.error("Kitap arama hatası (graceful):", err);
    return [];
  }
}

/** Tek kitabın detayı. */
export async function getBook(id: string): Promise<BookItem> {
  const data = await cached(`books:detail:${id}`, 3600, () =>
    books<GoogleVolume>(`/volumes/${id}`)
  );
  return normalize(data);
}

/** Popüler kitaplar (Keşfet ekranı). Erişilemezse boş dizi döner. */
export async function getPopularBooks(category = "fiction"): Promise<BookItem[]> {
  try {
    return await cached(`books:popular:${category}`, 1800, async () => {
      const data = await books<{ items?: GoogleVolume[] }>("/volumes", {
        q: `subject:${category}`,
        maxResults: "20",
        orderBy: "relevance",
        langRestrict: "tr",
      });

      const normalized = (data.items ?? []).map(normalize);
      return normalized.sort((a, b) => popularityScore(b) - popularityScore(a));
    });
  } catch (err) {
    console.error("Popüler kitap hatası (graceful):", err);
    return [];
  }
}