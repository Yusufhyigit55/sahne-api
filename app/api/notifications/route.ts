import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Notification, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { IMG } from "@/lib/tmdb";

/** Bildirimleri listele */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? 1);
    const limit = 30;

    await connectDB();

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ userId: auth.userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("actorId", "username displayName avatar")
        .populate("contentId", "type tmdbId googleBooksId titleTr posterPath")
        .lean(),
      Notification.countDocuments({ userId: auth.userId }),
      Notification.countDocuments({ userId: auth.userId, isRead: false }),
    ]);

    const items = (notifications as any[]).map((n) => {
      const content = n.contentId;

      return {
        id: n._id,
        type: n.type,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
        actor: n.actorId
          ? {
              id: n.actorId._id,
              username: n.actorId.username,
              displayName: n.actorId.displayName,
              avatar: n.actorId.avatar,
            }
          : null,
        content: content
          ? {
              type: content.type,
              id: content.tmdbId ?? content.googleBooksId,
              titleTr: content.titleTr,
              poster:
                content.type === "book"
                  ? content.posterPath
                  : IMG.poster(content.posterPath),
            }
          : null,
        commentId: n.commentId ?? null,
        season: n.season ?? null,
        episode: n.episode ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      unreadCount,
      page,
      hasMore: total > page * limit,
    });
  } catch (err) {
    console.error("Bildirim hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Okundu işaretle */
export async function PATCH(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // notificationId verilirse tek bildirim, verilmezse hepsi
    const { notificationId } = await req.json();

    await connectDB();

    if (notificationId) {
      await Notification.findOneAndUpdate(
        { _id: notificationId, userId: auth.userId },
        { $set: { isRead: true } }
      );
    } else {
      await Notification.updateMany(
        { userId: auth.userId, isRead: false },
        { $set: { isRead: true } }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Okundu işaretleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Bildirimi sil */
export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { notificationId } = await req.json();

    await connectDB();

    if (notificationId) {
      await Notification.deleteOne({
        _id: notificationId,
        userId: auth.userId,
      });
    } else {
      // Tümünü temizle
      await Notification.deleteMany({ userId: auth.userId });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Bildirim silme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}