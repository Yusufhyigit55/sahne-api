// app/api/giphy/route.ts : GIF arama/trend endpoint'i; Giphy anahtarını sunucuda tutarak sonuçları mobile döner.
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { searchGifs, trendingGifs } from "@/lib/giphy";

/** GIF ara (q verilmezse trend döner). */
export async function GET(req: NextRequest) {
  try {
    // Giriş zorunlu — API anahtarını rastgele kullanıma açmayalım
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    const gifs = q ? await searchGifs(q) : await trendingGifs();

    return NextResponse.json({ ok: true, gifs });
  } catch (err) {
    console.error("Giphy hatası:", err);
    return NextResponse.json({ error: "GIF yüklenemedi" }, { status: 500 });
  }
}