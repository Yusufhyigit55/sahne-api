import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, WatchRecord } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/watchLogic";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { type, id, rating } = await req.json();

    if (!type || !id) {
      return NextResponse.json({ error: "type ve id gerekli" }, { status: 400 });
    }

    if (rating !== null && (rating < 1 || rating > 10)) {
      return NextResponse.json(
        { error: "Puan 1-10 arasında olmalı" },
        { status: 400 }
      );
    }

    await connectDB();

    const query =
      type === "book"
        ? { type, googleBooksId: String(id) }
        : { type, tmdbId: Number(id) };

    const content = await Content.findOne(query);
    if (!content) {
      return NextResponse.json(
        { error: "Önce içeriği izlemelisin" },
        { status: 400 }
      );
    }

    const record = await WatchRecord.findOne({
      userId: auth.userId,
      contentId: content._id,
    });

    // KURAL: İzlenmemiş içerik puanlanamaz — sunucuda zorlanır
    const allowed = ["completed", "up_to_date", "watching", "reading"];
    if (!record || !allowed.includes(record.status)) {
      return NextResponse.json(
        { error: "İzlemediğin bir içeriğe puan veremezsin" },
        { status: 403 }
      );
    }

    const oldRating = record.rating;

    // Content'in ortalama puanını güncelle
    if (oldRating && rating) {
      // Değiştirme
      await Content.findByIdAndUpdate(content._id, {
        $inc: { ratingSum: rating - oldRating },
      });
    } else if (!oldRating && rating) {
      // İlk puan
      await Content.findByIdAndUpdate(content._id, {
        $inc: { ratingSum: rating, ratingCount: 1 },
      });
    } else if (oldRating && !rating) {
      // Puanı kaldırma
      await Content.findByIdAndUpdate(content._id, {
        $inc: { ratingSum: -oldRating, ratingCount: -1 },
      });
    }

    record.rating = rating;
    await record.save();

    if (rating && !oldRating) {
      await logActivity(auth.userId, "rated", content._id.toString(), {
        title: content.titleTr,
        rating,
      });
    }

    const updated = await Content.findById(content._id).lean();
    const appRating =
      updated && updated.ratingCount > 0
        ? Number((updated.ratingSum / updated.ratingCount).toFixed(1))
        : null;

    return NextResponse.json({
      ok: true,
      rating,
      appRating,
      ratingCount: updated?.ratingCount ?? 0,
    });
  } catch (err) {
    console.error("Puanlama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}