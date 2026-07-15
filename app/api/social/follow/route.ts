import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Follow, User, Block, Notification } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Takip et / takibi bırak */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "username gerekli" }, { status: 400 });
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
        { error: "Kendini takip edemezsin" },
        { status: 400 }
      );
    }

    // Engelleme kontrolü — iki yönlü
    const blocked = await Block.findOne({
      type: "block",
      $or: [
        { userId: auth.userId, targetUserId: target._id },
        { userId: target._id, targetUserId: auth.userId },
      ],
    });

    if (blocked) {
      return NextResponse.json(
        { error: "Bu kullanıcıyı takip edemezsin" },
        { status: 403 }
      );
    }

    const existing = await Follow.findOne({
      followerId: auth.userId,
      followingId: target._id,
    });

    // ---- Takibi bırak ----
    if (existing) {
      await Follow.deleteOne({ _id: existing._id });

      // Sayaçları güncelle (sadece kabul edilmiş takipler sayılır)
      if (existing.status === "accepted") {
        await User.findByIdAndUpdate(auth.userId, {
          $inc: { "stats.following": -1 },
        });
        await User.findByIdAndUpdate(target._id, {
          $inc: { "stats.followers": -1 },
        });
      }

      return NextResponse.json({ ok: true, status: null });
    }

    // ---- Takip et ----
    const status = target.isPrivate ? "pending" : "accepted";

    await Follow.create({
      followerId: auth.userId,
      followingId: target._id,
      status,
    });

    if (status === "accepted") {
      await User.findByIdAndUpdate(auth.userId, {
        $inc: { "stats.following": 1 },
      });
      await User.findByIdAndUpdate(target._id, {
        $inc: { "stats.followers": 1 },
      });
    }

    // Bildirim
    await Notification.create({
      userId: target._id,
      type: status === "pending" ? "follow_request" : "follow",
      actorId: auth.userId,
    });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("Takip hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Takipçi / takip edilen listesi */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const type = searchParams.get("type") ?? "followers"; // followers | following

    if (!username) {
      return NextResponse.json({ error: "username gerekli" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({
      username: username.toLowerCase(),
    }).lean();

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const uid = (user as any)._id;

    const filter =
      type === "followers"
        ? { followingId: uid, status: "accepted" }
        : { followerId: uid, status: "accepted" };

    const populateField = type === "followers" ? "followerId" : "followingId";

    const follows = await Follow.find(filter)
      .populate(populateField, "username displayName avatar isPrivate")
      .limit(100)
      .lean();

    const users = (follows as any[]).map((f) => {
      const u = f[populateField];
      return {
        id: u._id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        isPrivate: u.isPrivate,
      };
    });

    return NextResponse.json({ ok: true, users, total: users.length });
  } catch (err) {
    console.error("Takip listesi hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}