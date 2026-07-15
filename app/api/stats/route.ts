import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { getUserStats } from "@/lib/statsLogic";
import { cached } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "username gerekli" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({
      username: username.toLowerCase(),
    })
      .select("_id statsPublic")
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const u = user as any;
    const auth = getAuthUser(req);
    const isSelf = auth?.userId === u._id.toString();

    // Gizli istatistikler
    if (!isSelf && !u.statsPublic) {
      return NextResponse.json({ ok: true, stats: null, isPrivate: true });
    }

    // 10 dk önbellekli
    const stats = await cached(`stats:${u._id}`, 600, () =>
      getUserStats(u._id.toString())
    );

    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error("İstatistik hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}