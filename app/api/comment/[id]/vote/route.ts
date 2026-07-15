import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Comment, CommentVote, Notification } from "@/models";
import { getAuthUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    const { value } = await req.json();

    if (value !== 1 && value !== -1) {
      return NextResponse.json(
        { error: "value 1 veya -1 olmalı" },
        { status: 400 }
      );
    }

    await connectDB();

    const comment = await Comment.findById(id);
    if (!comment) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    const existing = await CommentVote.findOne({
      userId: auth.userId,
      commentId: id,
    });

    // Aynı oya tekrar bas → geri al
    if (existing && existing.value === value) {
      await CommentVote.deleteOne({ _id: existing._id });
      await Comment.findByIdAndUpdate(id, {
        $inc: value === 1 ? { likeCount: -1 } : { dislikeCount: -1 },
      });

      const updated = await Comment.findById(id).lean();
      return NextResponse.json({
        ok: true,
        myVote: 0,
        likeCount: (updated as any).likeCount,
        dislikeCount: (updated as any).dislikeCount,
      });
    }

    // Oy değiştir
    if (existing) {
      const inc: Record<string, number> = {};
      if (value === 1) {
        inc.likeCount = 1;
        inc.dislikeCount = -1;
      } else {
        inc.likeCount = -1;
        inc.dislikeCount = 1;
      }

      existing.value = value;
      await existing.save();
      await Comment.findByIdAndUpdate(id, { $inc: inc });
    } else {
      // Yeni oy
      await CommentVote.create({
        userId: auth.userId,
        commentId: id,
        value,
      });

      await Comment.findByIdAndUpdate(id, {
        $inc: value === 1 ? { likeCount: 1 } : { dislikeCount: 1 },
      });

      // Beğeni bildirimi (kendi yorumu değilse)
      if (value === 1 && comment.userId.toString() !== auth.userId) {
        await Notification.create({
          userId: comment.userId,
          type: "comment_like",
          actorId: auth.userId,
          commentId: id,
          contentId: comment.contentId,
        });
      }
    }

    const updated = await Comment.findById(id).lean();

    return NextResponse.json({
      ok: true,
      myVote: value,
      likeCount: (updated as any).likeCount,
      dislikeCount: (updated as any).dislikeCount,
    });
  } catch (err) {
    console.error("Yorum oylama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}