// app/api/admin/backfill-genres/route.ts : GEÇİCİ — mevcut dizi/film içeriklerinin genres alanını TMDB'den doldurur. Kullanıldıktan sonra silinecek.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getTvDetail, getMovieDetail } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {

    await connectDB();

    const contents = await Content.find({
      type: { $in: ["series", "movie"] },
      $or: [{ genres: { $exists: false } }, { genres: { $size: 0 } }],
      tmdbId: { $ne: null },
    });

    let updated = 0;
    let failed = 0;
    const log: string[] = [];

    for (const content of contents) {
      try {
        const detail =
          content.type === "series"
            ? await getTvDetail(content.tmdbId)
            : await getMovieDetail(content.tmdbId);

        const genres = Array.isArray(detail.genres)
          ? detail.genres.map((g: any) => g.name).filter(Boolean)
          : [];

        if (genres.length > 0) {
          content.genres = genres;
          await content.save();
          updated++;
          log.push(`✓ ${content.titleTr}: ${genres.join(", ")}`);
        }

        await new Promise((r) => setTimeout(r, 60));
      } catch (err) {
        failed++;
        log.push(`✗ ${content.titleTr} (${content.tmdbId})`);
      }
    }

    return NextResponse.json({
      ok: true,
      total: contents.length,
      updated,
      failed,
      log,
    });
  } catch (err) {
    console.error("Backfill hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}