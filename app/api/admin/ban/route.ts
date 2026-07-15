import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Ban, User, Notification } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { applyBan } from "@/lib/spoilerLogic";

/** Aktif ban'ları listele */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth || !["moderator", "admin"].includes(auth.role)) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    await connectDB();

    const bans = await Ban.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "username displayName")
      .populate("moderatorId", "username")
      .lean();

    const items = (bans as any[]).map((b) => ({
      id: b._id,
      user: {
        id: b.userId?._id,
        username: b.userId?.username,
        displayName: b.userId?.displayName,
      },
      reason: b.reason,
      banCount: b.banCount,
      durationDays: b.durationDays,
      expiresAt: b.expiresAt,
      isExpired: b.expiresAt ? new Date(b.expiresAt) < new Date() : false,
      moderator: b.moderatorId?.username ?? "sistem",
      createdAt: b.createdAt,
    }));

    return NextResponse.json({ ok: true, bans: items });
  } catch (err) {
    console.error("Ban listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Doğrudan ban uygula */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth || !["moderator", "admin"].includes(auth.role)) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    const { userId, reason } = await req.json();

    if (!userId || !reason) {
      return NextResponse.json(
        { error: "userId ve reason gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const ban = await applyBan(userId, reason, auth.userId);

    await Notification.create({
      userId,
      type: "ban",
      actorId: auth.userId,
      message: ban.expiresAt
        ? `Yorum yazma hakkın ${ban.durationDays} gün askıya alındı.`
        : "Yorum yazma hakkın kalıcı olarak kapatıldı.",
    });

    return NextResponse.json({
      ok: true,
      ban: {
        banCount: ban.banCount,
        durationDays: ban.durationDays,
        expiresAt: ban.expiresAt,
      },
    });
  } catch (err) {
    console.error("Ban hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Ban'ı kaldır */
export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth || !["moderator", "admin"].includes(auth.role)) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    const { banId } = await req.json();

    if (!banId) {
      return NextResponse.json({ error: "banId gerekli" }, { status: 400 });
    }

    await connectDB();

    const ban = await Ban.findByIdAndUpdate(
      banId,
      { $set: { isActive: false } },
      { returnDocument: "after" }
    );

    if (!ban) {
      return NextResponse.json({ error: "Ban bulunamadı" }, { status: 404 });
    }

    await Notification.create({
      userId: ban.userId,
      type: "ban",
      actorId: auth.userId,
      message: "Yorum yazma hakkın geri verildi.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Ban kaldırma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}