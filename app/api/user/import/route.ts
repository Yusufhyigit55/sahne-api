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

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const body = await req.json();
    const { source, data } = body ?? {};

    if (!source || !["letterboxd", "trakt", "tracks"].includes(source)) {
      return NextResponse.json(
        { error: "Geçersiz kaynak. letterboxd, trakt veya tracks olmalı" },
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
    const items = parseBySource(source, data);

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Dosyada aktarılabilir kayıt bulunamadı. Doğru dosyayı seçtiğinden emin ol.",
        },
        { status: 400 }
      );
    }

    if (items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Tek seferde en fazla ${MAX_ITEMS} kayıt aktarılabilir` },
        { status: 400 }
      );
    }

    await connectDB();

    const report = await resolveAndImport(auth.userId, items);

    return NextResponse.json({
      ok: true,
      report,
      message: `${report.added} kayıt eklendi, ${report.skipped} eşleşmedi, ${report.failed} hata.`,
    });
  } catch (err) {
    console.error("Veri içe aktarma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}