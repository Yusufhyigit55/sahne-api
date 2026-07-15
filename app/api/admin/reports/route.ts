import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Report, Comment, User } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Şikayetleri listele — sadece moderatör */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    if (!["moderator", "admin"].includes(auth.role)) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";
    const page = Number(searchParams.get("page") ?? 1);
    const limit = 30;

    await connectDB();

    const reports = await Report.find({ status })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("reporterId", "username displayName")
      .populate({
        path: "commentId",
        populate: {
          path: "userId",
          select: "username displayName",
        },
      })
      .lean();

    const total = await Report.countDocuments({ status });

    // Şikayet edilen kullanıcıların ceza geçmişi
    const items = [];

    for (const r of reports as any[]) {
      const comment = r.commentId;
      const targetUserId = comment?.userId?._id;

      let banHistory = 0;
      if (targetUserId) {
        const { Ban } = await import("@/models");
        banHistory = await Ban.countDocuments({ userId: targetUserId });
      }

      items.push({
        id: r._id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        reporter: {
          id: r.reporterId?._id,
          username: r.reporterId?.username,
        },
        comment: comment
          ? {
              id: comment._id,
              body: comment.body,
              isSpoiler: comment.isSpoiler,
              spoilerPending: comment.spoilerPending,
              createdAt: comment.createdAt,
              author: {
                id: comment.userId?._id,
                username: comment.userId?.username,
                displayName: comment.userId?.displayName,
                previousBans: banHistory,
              },
            }
          : null,
      });
    }

    return NextResponse.json({
      ok: true,
      reports: items,
      total,
      page,
      hasMore: total > page * limit,
    });
  } catch (err) {
    console.error("Şikayet listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}