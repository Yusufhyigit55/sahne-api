import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  User,
  WatchRecord,
  EpisodeWatch,
  BookProgress,
  EpisodeReview,
  CharacterVote,
  Comment,
  List,
  Badge,
} from "@/models";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/user/export
 * Giriş yapmış kullanıcının tüm kişisel verisini tek JSON olarak döndürür.
 * - Content bilgisi (başlık, tip, poster, yıl) her kayda gömülür ki okunabilir olsun.
 * - Hassas alanlar (şifre, doğrulama/sıfırlama kodları, pushToken) HARİÇ.
 * - Sadece kullanıcının kendi verisi; başkalarının verisi yok.
 * Response, dosya olarak inmesi için Content-Disposition header'ı taşır.
 */

// Content populate için ortak alan seti (dizi/film/kitap ne olduğunu anlatır)
const CONTENT_FIELDS = "type tmdbId googleBooksId titleTr titleOriginal posterPath year";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    const uid = auth.userId;

    // Profil — hassas alanlar zaten select:false, ama garanti olsun diye açıkça çıkarıyoruz
    const user = await User.findById(uid)
      .select(
        "-password -verificationCode -verificationCodeExpires -resetCode -resetCodeExpires -pushToken -appleId -googleId"
      )
      .lean();

    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    // Tüm kullanıcı verisini paralel çek (Content populate'li olanlar okunabilir gelsin)
    const [
      watchRecords,
      episodeWatches,
      bookProgress,
      episodeReviews,
      characterVotes,
      comments,
      lists,
      badges,
    ] = await Promise.all([
      WatchRecord.find({ userId: uid })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      EpisodeWatch.find({ userId: uid })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      BookProgress.find({ userId: uid })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      EpisodeReview.find({ userId: uid })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      CharacterVote.find({ userId: uid })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      Comment.find({ userId: uid, isDeleted: { $ne: true } })
        .populate("contentId", CONTENT_FIELDS)
        .lean(),
      List.find({ userId: uid })
        .populate("items.contentId", CONTENT_FIELDS)
        .lean(),
      Badge.find({ userId: uid }).lean(),
    ]);

    const exportData = {
      meta: {
        app: "Tracks",
        exportedAt: new Date().toISOString(),
        version: 1,
        userId: String(uid),
      },
      profile: user,
      watchRecords,
      episodeWatches,
      bookProgress,
      episodeReviews,
      characterVotes,
      comments,
      lists,
      badges,
      counts: {
        watchRecords: watchRecords.length,
        episodeWatches: episodeWatches.length,
        bookProgress: bookProgress.length,
        episodeReviews: episodeReviews.length,
        characterVotes: characterVotes.length,
        comments: comments.length,
        lists: lists.length,
        badges: badges.length,
      },
    };

    const filename = `tracks-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Veri dışa aktarma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}