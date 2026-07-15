import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  User,
  WatchRecord,
  EpisodeWatch,
  BookProgress,
  EpisodeReview,
  CharacterVote,
  Comment,
  CommentVote,
  Follow,
  Block,
  Activity,
  List,
  Notification,
  Badge,
  DismissedRec,
  Poll,
  PollVote,
} from "@/models";
import { getAuthUser, comparePassword } from "@/lib/auth";

export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Hesabı silmek için şifrenizi girin" },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findById(auth.userId).select("+password");
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }

    const uid = auth.userId;

    // Tüm kullanıcı verisini sil
    await Promise.all([
      WatchRecord.deleteMany({ userId: uid }),
      EpisodeWatch.deleteMany({ userId: uid }),
      BookProgress.deleteMany({ userId: uid }),
      EpisodeReview.deleteMany({ userId: uid }),
      CharacterVote.deleteMany({ userId: uid }),
      Comment.deleteMany({ userId: uid }),
      CommentVote.deleteMany({ userId: uid }),
      Follow.deleteMany({ $or: [{ followerId: uid }, { followingId: uid }] }),
      Block.deleteMany({ $or: [{ userId: uid }, { targetUserId: uid }] }),
      Activity.deleteMany({ userId: uid }),
      List.deleteMany({ userId: uid }),
      Notification.deleteMany({ $or: [{ userId: uid }, { actorId: uid }] }),
      Badge.deleteMany({ userId: uid }),
      DismissedRec.deleteMany({ userId: uid }),
      Poll.deleteMany({ creatorId: uid }),
      PollVote.deleteMany({ userId: uid }),
    ]);

    await User.findByIdAndDelete(uid);

    return NextResponse.json({
      ok: true,
      message: "Hesabınız ve tüm verileriniz kalıcı olarak silindi",
    });
  } catch (err) {
    console.error("Hesap silme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}