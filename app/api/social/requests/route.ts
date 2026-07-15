import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Follow, User, Notification } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Bekleyen takip istekleri */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    const requests = await Follow.find({
      followingId: auth.userId,
      status: "pending",
    })
      .populate("followerId", "username displayName avatar")
      .sort({ createdAt: -1 })
      .lean();

    const items = (requests as any[]).map((r) => ({
      id: r._id,
      user: {
        id: r.followerId._id,
        username: r.followerId.username,
        displayName: r.followerId.displayName,
        avatar: r.followerId.avatar,
      },
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ ok: true, requests: items });
  } catch (err) {
    console.error("İstek listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** İsteği onayla veya reddet */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    // action: "accept" | "reject"
    const { requestId, action } = await req.json();

    if (!requestId || !["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "requestId ve geçerli action gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const follow = await Follow.findById(requestId);

    if (!follow || follow.followingId.toString() !== auth.userId) {
      return NextResponse.json({ error: "İstek bulunamadı" }, { status: 404 });
    }

    if (action === "reject") {
      await Follow.deleteOne({ _id: requestId });
      return NextResponse.json({ ok: true, action: "reject" });
    }

    // Onayla
    follow.status = "accepted";
    await follow.save();

    await User.findByIdAndUpdate(follow.followerId, {
      $inc: { "stats.following": 1 },
    });
    await User.findByIdAndUpdate(auth.userId, {
      $inc: { "stats.followers": 1 },
    });

    await Notification.create({
      userId: follow.followerId,
      type: "follow_accepted",
      actorId: auth.userId,
    });

    return NextResponse.json({ ok: true, action: "accept" });
  } catch (err) {
    console.error("İstek işleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}