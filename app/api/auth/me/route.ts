import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, Ban } from "@/models";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(auth.userId).lean();
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const activeBan = await Ban.findOne({
      userId: auth.userId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();

    return NextResponse.json({
      ok: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        coverImage: user.coverImage,
        bio: user.bio,
        isPrivate: user.isPrivate,
        activityHidden: user.activityHidden,
        statsPublic: user.statsPublic,
        theme: user.theme,
        language: user.language,
        preferredGenres: user.preferredGenres,
        notifPrefs: user.notifPrefs,
        stats: user.stats,
        streak: user.streak,
        onboarded: user.onboarded,
        role: user.role,
        
      },
      ban: activeBan
        ? { reason: activeBan.reason, expiresAt: activeBan.expiresAt }
        : null,
    });
  } catch (err) {
    console.error("Me hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}