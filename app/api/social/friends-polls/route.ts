// app/api/social/friends-polls/route.ts : Takip edilenlerin açtığı son anketler (Sosyal şeridi).
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getFriendsPolls } from "@/lib/socialLogic";
import { cached } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }
    await connectDB();
    const polls = await cached(`friendsPolls:${auth.userId}`, 120, () =>
      getFriendsPolls(auth.userId, 10)
    );
    return NextResponse.json({ ok: true, polls });
  } catch (err) {
    console.error("Friends polls hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}