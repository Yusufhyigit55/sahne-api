// lib/giphy.ts : Giphy API'den GIF arama ve trend GIF getirme servisi (API anahtarı sunucuda kalır).
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const BASE = "https://api.giphy.com/v1/gifs";

export type GiphyGif = {
  id: string;
  url: string; // oynatılabilir gif (sabit boyut)
  previewUrl: string; // küçük önizleme
  width: number;
  height: number;
};

/** Giphy yanıtındaki bir gif'i sade formata indirger. */
function mapGif(g: any): GiphyGif {
  const full = g.images?.fixed_width ?? g.images?.original;
  const preview = g.images?.fixed_width_small ?? g.images?.fixed_width;

  return {
    id: g.id,
    url: full?.url ?? "",
    previewUrl: preview?.url ?? full?.url ?? "",
    width: Number(full?.width ?? 200),
    height: Number(full?.height ?? 200),
  };
}

/** Arama sorgusuna göre GIF listesi. */
export async function searchGifs(
  query: string,
  limit = 24
): Promise<GiphyGif[]> {
  if (!GIPHY_API_KEY) {
    throw new Error("GIPHY_API_KEY tanımlı değil");
  }

  const url = new URL(`${BASE}/search`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", "pg-13"); // uygunsuz içeriği ele
  url.searchParams.set("lang", "tr");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Giphy arama hatası");

  const json = await res.json();
  return (json.data ?? []).map(mapGif);
}

/** Trend GIF'ler (arama boşken gösterilir). */
export async function trendingGifs(limit = 24): Promise<GiphyGif[]> {
  if (!GIPHY_API_KEY) {
    throw new Error("GIPHY_API_KEY tanımlı değil");
  }

  const url = new URL(`${BASE}/trending`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", "pg-13");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Giphy trend hatası");

  const json = await res.json();
  return (json.data ?? []).map(mapGif);
}