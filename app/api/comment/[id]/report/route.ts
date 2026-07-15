import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Comment, Report, REPORT_REASONS } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { checkSpoilerReports } from "@/lib/spoilerLogic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    const { reason, note } = await req.json();

    if (!reason || !REPORT_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: "Geçersiz şikayet nedeni" },
        { status: 400 }
      );
    }

    await connectDB();

    const comment = await Comment.findById(id);
    if (!comment) {
      return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
    }

    // Kendi yorumunu bildiremez
    if (comment.userId.toString() === auth.userId) {
      return NextResponse.json(
        { error: "Kendi yorumunu bildiremezsin" },
        { status: 400 }
      );
    }

    // Aynı kullanıcı aynı yorumu bir kez bildirebilir
    const existing = await Report.findOne({
      reporterId: auth.userId,
      commentId: id,
    });

    if (existing) {
      return NextResponse.json(
        { error: "Bu yorumu zaten bildirdin" },
        { status: 409 }
      );
    }

    await Report.create({
      reporterId: auth.userId,
      targetType: "comment",
      commentId: id,
      reason,
      note: note ?? "",
      status: "pending",
    });

    // Spoiler bildirimi ise yorumu incelemeye al
    if (reason === "unmarked_spoiler") {
      await checkSpoilerReports(id);
    }

    return NextResponse.json({
      ok: true,
      message: "Bildirimin alındı. İnceleyeceğiz.",
    });
  } catch (err) {
    console.error("Şikayet hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}