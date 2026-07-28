// app/api/social/trending/route.ts : Takip edilenlerin son 7 günde en çok izlediği içerikler (trend özeti).
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getFriendsTrending } from "@/lib/socialLogic";
import { cached } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }
    await connectDB();
    // 5 dk önbellekli (kullanıcıya özel)
    const trending = await cached(`trending:${auth.userId}`, 300, () =>
      getFriendsTrending(auth.userId, 8)
    );
    return NextResponse.json({ ok: true, trending });
  } catch (err) {
    console.error("Trending hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}