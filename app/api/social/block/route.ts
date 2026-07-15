import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Block, Follow, User } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Engelle / sessize al — veya geri al */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // type: "block" | "mute"
    const { username, type } = await req.json();

    if (!username || !["block", "mute"].includes(type)) {
      return NextResponse.json(
        { error: "username ve geçerli type gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const target = await User.findOne({ username: username.toLowerCase() });
    if (!target) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    if (target._id.toString() === auth.userId) {
      return NextResponse.json(
        { error: "Kendini engelleyemezsin" },
        { status: 400 }
      );
    }

    const existing = await Block.findOne({
      userId: auth.userId,
      targetUserId: target._id,
      type,
    });

    // Geri al
    if (existing) {
      await Block.deleteOne({ _id: existing._id });
      return NextResponse.json({ ok: true, active: false, type });
    }

    // Uygula
    await Block.create({
      userId: auth.userId,
      targetUserId: target._id,
      type,
    });

    // Engellemede karşılıklı takip silinir
    if (type === "block") {
      const follows = await Follow.find({
        $or: [
          { followerId: auth.userId, followingId: target._id },
          { followerId: target._id, followingId: auth.userId },
        ],
        status: "accepted",
      });

      for (const f of follows) {
        await User.findByIdAndUpdate(f.followerId, {
          $inc: { "stats.following": -1 },
        });
        await User.findByIdAndUpdate(f.followingId, {
          $inc: { "stats.followers": -1 },
        });
      }

      await Follow.deleteMany({
        $or: [
          { followerId: auth.userId, followingId: target._id },
          { followerId: target._id, followingId: auth.userId },
        ],
      });
    }

    return NextResponse.json({ ok: true, active: true, type });
  } catch (err) {
    console.error("Engelleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Engellenen / sessize alınan kullanıcılar */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "block";

    await connectDB();

    const blocks = await Block.find({ userId: auth.userId, type })
      .populate("targetUserId", "username displayName avatar")
      .lean();

    const users = (blocks as any[]).map((b) => ({
      id: b.targetUserId._id,
      username: b.targetUserId.username,
      displayName: b.targetUserId.displayName,
      avatar: b.targetUserId.avatar,
      blockedAt: b.createdAt,
    }));

    return NextResponse.json({ ok: true, users, type });
  } catch (err) {
    console.error("Engel listesi hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}