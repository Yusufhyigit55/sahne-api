import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getCompatibility } from "@/lib/socialLogic";
import { cached } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "username gerekli" }, { status: 400 });
    }

    await connectDB();

    const target = await User.findOne({
      username: username.toLowerCase(),
    })
      .select("_id isPrivate activityHidden")
      .lean();
    if (!target) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }
    const t = target as any;
    const targetId = t._id.toString();
    // Kendinle uyum yok
    if (targetId === auth.userId) {
      return NextResponse.json({ ok: true, compatibility: null });
    }

    // Gizlilik kuralları:
    // 1) Aktivite gizliyse → uyum hesaplanmaz (kimse için)
    if (t.activityHidden) {
      return NextResponse.json({ ok: true, compatibility: null, locked: true });
    }
    // 2) Gizli hesap + takip etmiyorsan → kapalı
    if (t.isPrivate) {
      const { Follow } = await import("@/models");
      const follows = await Follow.findOne({
        followerId: auth.userId,
        followingId: targetId,
        status: "accepted",
      });
      if (!follows) {
        return NextResponse.json({
          ok: true,
          compatibility: null,
          locked: true,
        });
      }
    }

    // 10 dk önbellekli
    const compatibility = await cached(
      `compat:${auth.userId}:${targetId}`,
      600,
      () => getCompatibility(auth.userId, targetId)
    );

    return NextResponse.json({ ok: true, compatibility });
  } catch (err) {
    console.error("Uyum hesaplama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}