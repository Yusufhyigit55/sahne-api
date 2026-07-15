import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getSuggestedUsers } from "@/lib/socialLogic";
import { cached } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ ok: true, users: [] });
    }

    await connectDB();

    // 30 dk önbellekli
    const users = await cached(`suggest:${auth.userId}`, 1800, () =>
      getSuggestedUsers(auth.userId, 10)
    );

    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error("Kullanıcı önerisi hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}