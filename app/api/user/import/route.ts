import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { parseBySource } from "@/lib/importParsers";
import { resolveAndImport } from "@/lib/importLogic";

/**
 * POST /api/user/import
 * Body: { source: "letterboxd" | "trakt" | "tracks", data: string }
 *  - data: dosyanın ham metni (Letterboxd CSV, Trakt JSON, Tracks JSON)
 * Mobil taraf dosyayı okuyup metnini bu endpoint'e string olarak gönderir.
 *
 * Güvenlik: aşırı büyük dosyaları reddet (basit sınır).
 */

const MAX_ITEMS = 5000; // tek seferde işlenecek azami satır

// Import çok içerik + TMDB çağrısı içerir; Vercel fonksiyon süresini uzat
export const maxDuration = 60; // saniye (Hobby plan limiti)
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const body = await req.json();
    const { source, data } = body ?? {};

    if (
      !source ||
      !["letterboxd", "trakt", "tracks", "tvtime"].includes(source)
    ) {
      return NextResponse.json(
        {
          error:
            "Geçersiz kaynak. letterboxd, trakt, tvtime veya tracks olmalı",
        },
        { status: 400 }
      );
    }

    if (!data || typeof data !== "string" || data.trim().length === 0) {
      return NextResponse.json(
        { error: "Aktarılacak dosya içeriği boş" },
        { status: 400 }
      );
    }

    // Ham metni ara-formata çevir
    const allItems = parseBySource(source, data);
    if (allItems.length === 0) {
      return NextResponse.json(
        {
          error:
            "Dosyada aktarılabilir kayıt bulunamadı. Doğru dosyayı seçtiğinden emin ol.",
        },
        { status: 400 }
      );
    }
    if (allItems.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Tek seferde en fazla ${MAX_ITEMS} kayıt aktarılabilir` },
        { status: 400 }
      );
    }

    // Batch (parça parça) import: offset + limit ile sadece bir dilimi işle.
    // Frontend, timeout olmaması için içeriği 50'şer gönderir.
    const offset = Math.max(0, Number(body.offset ?? 0));
    const limit = Math.max(1, Math.min(50, Number(body.limit ?? allItems.length)));
    const slice = allItems.slice(offset, offset + limit);

    await connectDB();
    const report = await resolveAndImport(auth.userId, slice);

    return NextResponse.json({
      ok: true,
      report,
      total: allItems.length, // frontend kaç batch gerektiğini bilsin
      processed: offset + slice.length, // buraya kadar işlenen
      hasMore: offset + slice.length < allItems.length,
      message: `${report.added} kayıt eklendi, ${report.skipped} eşleşmedi, ${report.failed} hata.`,
    });
  } catch (err) {
    console.error("Veri içe aktarma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}