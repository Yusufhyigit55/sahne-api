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

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Google Books hatası ${res.status}: ${path}`);
  }

  return res.json() as Promise<T>;
}

/** Kitap ara. Türkçe öncelikli, bilinirliğe göre sıralı. */
export async function searchBooks(query: string, page = 1): Promise<BookItem[]> {
  const startIndex = (page - 1) * 20;

  const data = await books<{ items?: GoogleVolume[] }>("/volumes", {
    q: query,
    maxResults: "20",
    startIndex: String(startIndex),
    langRestrict: "tr",
    orderBy: "relevance",
  });

  let items = data.items ?? [];

  // Türkçe sonuç yoksa dil kısıtı olmadan tekrar dene
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

  // Bilinen baskılar önce
  return normalized.sort((a, b) => popularityScore(b) - popularityScore(a));
}

/** Tek kitabın detayı. */
export async function getBook(id: string): Promise<BookItem> {
  const data = await books<GoogleVolume>(`/volumes/${id}`);
  return normalize(data);
}

/** Popüler kitaplar (Keşfet ekranı). */
export async function getPopularBooks(category = "fiction"): Promise<BookItem[]> {
  const data = await books<{ items?: GoogleVolume[] }>("/volumes", {
    q: `subject:${category}`,
    maxResults: "20",
    orderBy: "relevance",
    langRestrict: "tr",
  });

  const normalized = (data.items ?? []).map(normalize);
  return normalized.sort((a, b) => popularityScore(b) - popularityScore(a));
}