import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Comment, CommentVote } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { processComments } from "@/lib/spoilerLogic";

type Params = { params: Promise<{ id: string }> };

/** Bir yorumun yanıtlarını getir */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await connectDB();

    const parent = await Comment.findById(id).lean();
    if (!parent) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    const auth = getAuthUser(req);

    const replies = await Comment.find({ parentId: id })
      .sort({ createdAt: 1 })
      .populate("userId", "username displayName avatar")
      .populate("mentionedUser", "username displayName")
      .lean();

    if (auth && replies.length) {
      const votes = await CommentVote.find({
        userId: auth.userId,
        commentId: { $in: replies.map((r: any) => r._id) },
      }).lean();

      const voteMap = new Map(
        votes.map((v: any) => [v.commentId.toString(), v.value])
      );

      for (const r of replies as any[]) {
        r.myVote = voteMap.get(r._id.toString()) ?? 0;
      }
    }

    const p = parent as any;

    const processed = await processComments(
      replies,
      auth?.userId ?? null,
      p.contentId.toString(),
      p.season ?? undefined,
      p.episode ?? undefined
    );

    return NextResponse.json({ ok: true, replies: processed });
  } catch (err) {
    console.error("Yanıt listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Yorumu düzenle */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    const { body, isSpoiler } = await req.json();

    await connectDB();

    const comment = await Comment.findById(id);
    if (!comment) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    if (comment.userId.toString() !== auth.userId) {
      return NextResponse.json(
        { error: "Sadece kendi yorumunu düzenleyebilirsin" },
        { status: 403 }
      );
    }

    if (comment.isDeleted) {
      return NextResponse.json(
        { error: "Silinmiş yorum düzenlenemez" },
        { status: 400 }
      );
    }

    if (body != null) {
      if (!body.trim()) {
        return NextResponse.json({ error: "Yorum boş olamaz" }, { status: 400 });
      }
      comment.body = body.trim();
    }

    if (isSpoiler != null) {
      comment.isSpoiler = !!isSpoiler;
    }

    comment.editedAt = new Date();
    await comment.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Yorum düzenleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Yorumu sil — yanıtları da silinir */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const comment = await Comment.findById(id);
    if (!comment) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    const isOwner = comment.userId.toString() === auth.userId;
    const isModerator = ["moderator", "admin"].includes(auth.role);

    if (!isOwner && !isModerator) {
      return NextResponse.json(
        { error: "Bu yorumu silemezsin" },
        { status: 403 }
      );
    }

    if (!comment.parentId) {
      const replies = await Comment.find({ parentId: id }).select("_id");
      const replyIds = replies.map((r: any) => r._id);

      await Comment.deleteMany({ parentId: id });
      await CommentVote.deleteMany({ commentId: { $in: [id, ...replyIds] } });
      await Comment.findByIdAndDelete(id);
    } else {
      await Comment.findByIdAndUpdate(comment.parentId, {
        $inc: { replyCount: -1 },
      });
      await CommentVote.deleteMany({ commentId: id });
      await Comment.findByIdAndDelete(id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Yorum silme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}