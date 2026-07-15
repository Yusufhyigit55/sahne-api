import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, WatchRecord } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent } from "@/lib/watchLogic";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // action: "like" | "dislike" | "favorite" | "watchlist"
    const { type, id, action } = await req.json();

    if (!type || !id || !action) {
      return NextResponse.json(
        { error: "type, id ve action gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    // İçerik DB'de yoksa oluştur (önbellekli)
    const content = await ensureContent(type, id);

    // Atomik: varsa getir, yoksa oluştur — yarış koşulu yok
    // Beğeni/favori için "watchlist" durumu atama — nötr kalsın
    const initialStatus = action === "watchlist" ? "watchlist" : "none";

    const record = await WatchRecord.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      { $setOnInsert: { status: initialStatus } },
      { upsert: true, returnDocument: "after" }
    );

    if (!record) {
      return NextResponse.json(
        { error: "Kayıt oluşturulamadı" },
        { status: 500 }
      );
    }

    const wasLiked = record.isLiked;
    const wasDisliked = record.isDisliked;

    if (action === "like") {
      record.isLiked = !wasLiked;
      record.isDisliked = false;

      const inc: Record<string, number> = {
        likeCount: record.isLiked ? 1 : -1,
      };
      if (wasDisliked) inc.dislikeCount = -1;

      // Sayaç güncellemesi — beklemeye gerek yok
      Content.findByIdAndUpdate(content._id, { $inc: inc }).exec();
    } else if (action === "dislike") {
      record.isDisliked = !wasDisliked;
      record.isLiked = false;

      const inc: Record<string, number> = {
        dislikeCount: record.isDisliked ? 1 : -1,
      };
      if (wasLiked) inc.likeCount = -1;

      Content.findByIdAndUpdate(content._id, { $inc: inc }).exec();
    } else if (action === "favorite") {
      record.isFavorite = !record.isFavorite;
    } else if (action === "watchlist") {
      // Listedeyse çıkar (none yap), değilse ekle
      if (record.status === "watchlist") {
        record.status = "none";
      } else {
        record.status = "watchlist";
      }
      record.manualOverride = true;
    } else {
      return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
    }

    await record.save();

    // Content'i tekrar okumaya gerek yok
    return NextResponse.json({
      ok: true,
      status: record.status,
      isLiked: record.isLiked,
      isDisliked: record.isDisliked,
      isFavorite: record.isFavorite,
    });
  } catch (err) {
    console.error("Beğenme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}