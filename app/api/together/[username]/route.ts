// app/api/together/[username]/route.ts : Giriş yapan kullanıcı ile [username] için ortak öneri.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getTogetherRecommendations } from "@/lib/togetherLogic";
import { cached } from "@/lib/cache";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { username } = await params;

    await connectDB();

    // Hedef kullanıcı
    const other = await User.findOne({
      username: username.toLowerCase(),
    })
      .select(
        "_id username displayName avatar statsPublic isPrivate activityHidden"
      )
      .lean();
    if (!other) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const o = other as any;

    // Kendisiyle karşılaştıramaz
    if (o._id.toString() === auth.userId) {
      return NextResponse.json(
        { error: "Kendinle karşılaştıramazsın" },
        { status: 400 }
      );
    }

    // Aktivite gizliyse Birlikte Ne İzleyelim çalışmaz
    if (o.activityHidden) {
      return NextResponse.json(
        { error: "Bu kullanıcının aktivitesi gizli", locked: true },
        { status: 403 }
      );
    }

    // Gizli hesap: takip etmiyorsan "Birlikte Ne İzleyelim" çalışmaz
    if (o.isPrivate) {
      const { Follow } = await import("@/models");
      const follows = await Follow.findOne({
        followerId: auth.userId,
        followingId: o._id,
        status: "accepted",
      });
      if (!follows) {
        return NextResponse.json(
          { error: "Bu özellik gizli hesaplarda kullanılamaz", locked: true },
          { status: 403 }
        );
      }
    }

    // Önbellekli (kullanıcı çiftine göre, 2 dk)
    const pairKey = [auth.userId, o._id.toString()].sort().join(":");
    const result = await cached(`together:${pairKey}`, 120, () =>
      getTogetherRecommendations(auth.userId, o._id.toString())
    );

    return NextResponse.json({
      ok: true,
      other: {
        username: o.username,
        displayName: o.displayName,
        avatar: o.avatar,
      },
      ...result,
    });
  } catch (err) {
    console.error("Together hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}