import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Comment, Report, Notification } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { applyBan } from "@/lib/spoilerLogic";

type Params = { params: Promise<{ id: string }> };

/**
 * Moderatör kararı.
 * action: "mark_spoiler" | "delete" | "dismiss" | "ban"
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    if (!["moderator", "admin"].includes(auth.role)) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    const { id } = await params;
    const { action, reason, applyPenalty } = await req.json();

    await connectDB();

    const comment = await Comment.findById(id);
    if (!comment) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    // ---- Spoiler olarak işaretle ----
    if (action === "mark_spoiler") {
      comment.isSpoiler = true;
      comment.spoilerConfirmedBy = auth.userId as any;
      comment.spoilerPending = false;
      await comment.save();

      // Yazara bildir
      await Notification.create({
        userId: comment.userId,
        type: "spoiler_flagged",
        actorId: auth.userId,
        commentId: comment._id,
        contentId: comment.contentId,
        message: "Yorumun spoiler olarak işaretlendi.",
      });

      // Ceza uygula (işaretlemeden spoiler yazdı)
      let ban = null;
      if (applyPenalty) {
        ban = await applyBan(
          comment.userId.toString(),
          "unmarked_spoiler",
          auth.userId
        );

        await Notification.create({
          userId: comment.userId,
          type: "ban",
          actorId: auth.userId,
          message: ban.expiresAt
            ? `Yorum yazma hakkın ${ban.durationDays} gün askıya alındı.`
            : "Yorum yazma hakkın kalıcı olarak kapatıldı.",
        });
      }

      // Şikayetleri çöz
      await Report.updateMany(
        { commentId: id, status: "pending" },
        {
          $set: {
            status: "resolved",
            resolvedBy: auth.userId,
            resolvedAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        ok: true,
        action: "mark_spoiler",
        ban: ban
          ? {
              banCount: ban.banCount,
              durationDays: ban.durationDays,
              expiresAt: ban.expiresAt,
            }
          : null,
      });
    }

    // ---- Yorumu sil ----
    if (action === "delete") {
      // Ana yorumsa yanıtları da sil
      if (!comment.parentId) {
        await Comment.deleteMany({ parentId: id });
      }

      const authorId = comment.userId.toString();
      await Comment.findByIdAndDelete(id);

      // Ceza uygula
      let ban = null;
      if (applyPenalty && reason) {
        ban = await applyBan(authorId, reason, auth.userId);

        await Notification.create({
          userId: authorId,
          type: "ban",
          actorId: auth.userId,
          message: ban.expiresAt
            ? `Yorumun kaldırıldı. Yorum yazma hakkın ${ban.durationDays} gün askıya alındı.`
            : "Yorumun kaldırıldı. Yorum yazma hakkın kalıcı olarak kapatıldı.",
        });
      }

      await Report.updateMany(
        { commentId: id, status: "pending" },
        {
          $set: {
            status: "resolved",
            resolvedBy: auth.userId,
            resolvedAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        ok: true,
        action: "delete",
        ban: ban
          ? {
              banCount: ban.banCount,
              durationDays: ban.durationDays,
              expiresAt: ban.expiresAt,
            }
          : null,
      });
    }

    // ---- Şikayeti reddet ----
    if (action === "dismiss") {
      comment.spoilerPending = false;
      await comment.save();

      await Report.updateMany(
        { commentId: id, status: "pending" },
        {
          $set: {
            status: "rejected",
            resolvedBy: auth.userId,
            resolvedAt: new Date(),
          },
        }
      );

      return NextResponse.json({ ok: true, action: "dismiss" });
    }

    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err) {
    console.error("Moderasyon hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}