import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, Follow, Block } from "@/models";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, users: [] });
    }

    await connectDB();

    const auth = getAuthUser(req);

    // Engellenenleri hariç tut
    let excludeIds: any[] = [];

    if (auth) {
      const blocks = await Block.find({
        type: "block",
        $or: [{ userId: auth.userId }, { targetUserId: auth.userId }],
      }).lean();

      excludeIds = (blocks as any[]).flatMap((b) => [
        b.userId,
        b.targetUserId,
      ]);

      // Kendini de listeleme
      excludeIds.push(auth.userId);
    }

    // Kullanıcı adı veya görünen isimde ara
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const users = await User.find({
      _id: { $nin: excludeIds },
      $or: [{ username: regex }, { displayName: regex }],
    })
      .select("username displayName avatar isPrivate stats.followers")
      .limit(30)
      .lean();

    // Takip durumlarını tek sorguda getir
    let followMap = new Map<string, string>();

    if (auth && users.length) {
      const follows = await Follow.find({
        followerId: auth.userId,
        followingId: { $in: (users as any[]).map((u) => u._id) },
      }).lean();

      followMap = new Map(
        (follows as any[]).map((f) => [f.followingId.toString(), f.status])
      );
    }

    const items = (users as any[]).map((u) => ({
      id: u._id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      isPrivate: u.isPrivate,
      followers: u.stats?.followers ?? 0,
      followStatus: followMap.get(u._id.toString()) ?? null,
    }));

    return NextResponse.json({ ok: true, users: items });
  } catch (err) {
    console.error("Kullanıcı arama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}