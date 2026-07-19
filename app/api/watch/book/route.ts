import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Content, WatchRecord, BookProgress, User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent, logActivity } from "@/lib/watchLogic";
import { notifyFollowers } from "@/lib/notify";
import { getBook } from "@/lib/books";

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { googleBooksId, currentPage, percent, status, trackBy } =
      await req.json();

    if (!googleBooksId) {
      return NextResponse.json(
        { error: "googleBooksId gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const book = await getBook(googleBooksId);

    const content = await ensureContent("book", googleBooksId, {
      titleTr: book.title,
      titleOriginal: book.title,
      posterPath: book.thumbnail,
      year: book.publishedDate ? Number(book.publishedDate.slice(0, 4)) : null,
      pageCount: book.pageCount ?? 0,
    });

    const total = book.pageCount ?? 0;

    let finalPercent = percent ?? 0;
    let finalPage = currentPage ?? 0;

    if (trackBy === "page" && total > 0 && currentPage != null) {
      finalPercent = Math.min(Math.round((currentPage / total) * 100), 100);
    } else if (trackBy === "percent" && total > 0 && percent != null) {
      finalPage = Math.round((percent / 100) * total);
    }

    let finalStatus = status;
    if (!finalStatus) {
      if (finalPercent >= 100) finalStatus = "completed";
      else if (finalPercent > 0) finalStatus = "reading";
      else finalStatus = "watchlist";
    }

    const wasCompleted = await WatchRecord.exists({
      userId: auth.userId,
      contentId: content._id,
      status: "completed",
    });

    await BookProgress.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      {
        $set: {
          currentPage: finalPage,
          totalPages: total,
          percent: finalPercent,
          trackBy: trackBy ?? "page",
          finishedAt: finalStatus === "completed" ? new Date() : null,
        },
        $setOnInsert: { startedAt: new Date() },
      },
      { upsert: true }
    );

    await WatchRecord.findOneAndUpdate(
      { userId: auth.userId, contentId: content._id },
      {
        $set: {
          status: finalStatus,
          watchedAt: finalStatus === "completed" ? new Date() : null,
        },
        $setOnInsert: { startedAt: new Date() },
      },
      { upsert: true }
    );

    if (finalStatus === "completed" && !wasCompleted) {
      await Content.findByIdAndUpdate(content._id, {
        $inc: { addedByCount: 1 },
      });
      await User.findByIdAndUpdate(auth.userId, {
        $inc: { "stats.booksRead": 1 },
      });
      await logActivity(auth.userId, "finished_book", content._id.toString(), {
        title: content.titleTr,
      });
      // Takipçilere "arkadaşın kitabı bitirdi" bildirimi
      await notifyFollowers({
        actorId: auth.userId,
        type: "friend_watched",
        contentId: content._id.toString(),
        message: content.titleTr ?? "",
      });
    }

    return NextResponse.json({
      ok: true,
      currentPage: finalPage,
      totalPages: total,
      percent: finalPercent,
      status: finalStatus,
    });
  } catch (err) {
    console.error("Kitap ilerleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}