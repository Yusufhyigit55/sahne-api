// app/api/poll/[id]/vote/route.ts : Bir ankete oy verir, oyu değiştirir veya geri çeker; sayaçları atomik günceller.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Poll, PollVote } from "@/models";
import { getAuthUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/** Ankete oy ver / değiştir / geri çek. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    const { optionIds } = await req.json(); // string[] — seçilen seçenek id'leri

    if (!Array.isArray(optionIds)) {
      return NextResponse.json(
        { error: "optionIds bir dizi olmalı" },
        { status: 400 }
      );
    }

    await connectDB();

    const poll = await Poll.findById(id);
    if (!poll) {
      return NextResponse.json({ error: "Anket bulunamadı" }, { status: 404 });
    }

    if (poll.isClosed) {
      return NextResponse.json({ error: "Bu anket kapandı" }, { status: 403 });
    }

    // Seçilen id'ler gerçekten bu ankete mi ait?
    const validIds = new Set(poll.options.map((o: any) => o._id.toString()));
    const chosen = optionIds.map((x: any) => String(x));

    if (chosen.some((oid: string) => !validIds.has(oid))) {
      return NextResponse.json(
        { error: "Geçersiz seçenek" },
        { status: 400 }
      );
    }

    // Tek seçimli anketlerde birden fazla seçilemez
    const single = poll.type === "single" || poll.type === "yesno" || poll.type === "prediction";
    if (single && chosen.length > 1) {
      return NextResponse.json(
        { error: "Bu ankette tek seçim yapabilirsin" },
        { status: 400 }
      );
    }

    if (chosen.length === 0) {
      return NextResponse.json(
        { error: "En az bir seçenek seçmelisin" },
        { status: 400 }
      );
    }

    // ---- Önceki oyu bul ----
    const existing = await PollVote.findOne({
      userId: auth.userId,
      pollId: id,
    });

    // Aynı seçime tekrar bas → oyu geri çek
    if (existing) {
      const prev = existing.optionIds.map((x: any) => x.toString()).sort();
      const now = [...chosen].sort();
      const same =
      prev.length === now.length && prev.every((v: string, i: number) => v === now[i]);
      if (same) {
        // Geri çek: sayaçları düşür, oyu sil
        for (const oid of prev) {
          const opt = poll.options.id(oid);
          if (opt) opt.voteCount = Math.max(0, opt.voteCount - 1);
        }
        poll.totalVotes = Math.max(0, poll.totalVotes - 1);
        await poll.save();
        await PollVote.deleteOne({ _id: existing._id });

        return NextResponse.json({
          ok: true,
          myOptionIds: null,
          hasVoted: false,
          options: poll.options.map((o: any) => ({
            id: o._id.toString(),
            text: o.text,
            voteCount: o.voteCount,
            percent: null,
          })),
          totalVotes: poll.totalVotes,
        });
      }

      // Oyu değiştir: eski seçimlerin sayacını düşür, yenileri artır
      for (const oid of prev) {
        const opt = poll.options.id(oid);
        if (opt) opt.voteCount = Math.max(0, opt.voteCount - 1);
      }
      for (const oid of chosen) {
        const opt = poll.options.id(oid);
        if (opt) opt.voteCount += 1;
      }
      // totalVotes değişmez (zaten oy vermişti)
      existing.optionIds = chosen;
      await existing.save();
      await poll.save();
    } else {
      // ---- Yeni oy ----
      for (const oid of chosen) {
        const opt = poll.options.id(oid);
        if (opt) opt.voteCount += 1;
      }
      poll.totalVotes += 1;
      await poll.save();

      await PollVote.create({
        userId: auth.userId,
        pollId: id,
        optionIds: chosen,
      });
    }

    return NextResponse.json({
      ok: true,
      myOptionIds: chosen,
      hasVoted: true,
      options: poll.options.map((o: any) => ({
        id: o._id.toString(),
        text: o.text,
        voteCount: o.voteCount,
        percent:
          poll.totalVotes > 0
            ? Math.round((o.voteCount / poll.totalVotes) * 100)
            : 0,
      })),
      totalVotes: poll.totalVotes,
    });
  } catch (err) {
    console.error("Anket oylama hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}