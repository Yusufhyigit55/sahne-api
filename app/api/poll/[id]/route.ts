// app/api/poll/[id]/route.ts : Anketi siler (sadece sahibi veya moderatör/admin) ve oylarını temizler.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Poll, PollVote, User } from "@/models";
import { getAuthUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** Anketi sil. Sahibi veya moderatör/admin yapabilir. Oyları da silinir. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();

    const poll = await Poll.findById(id);
    if (!poll) {
      return NextResponse.json({ error: "Anket bulunamadı" }, { status: 404 });
    }

    const isOwner = poll.creatorId.toString() === auth.userId;

    let isMod = false;
    if (!isOwner) {
      const user = await User.findById(auth.userId).select("role").lean();
      isMod = ["moderator", "admin"].includes((user as any)?.role);
    }

    if (!isOwner && !isMod) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    await PollVote.deleteMany({ pollId: id });
    await Poll.deleteOne({ _id: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Anket silme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}