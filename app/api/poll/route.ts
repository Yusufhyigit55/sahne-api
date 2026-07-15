// app/api/poll/route.ts : İçeriğe ait anketleri listeler (GET) ve yeni anket oluşturur (POST).
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Poll, PollVote, WatchRecord, EpisodeWatch, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent } from "@/lib/watchLogic";

const POLL_TYPES = ["single", "multiple", "yesno", "prediction"] as const;
const TARGET_TYPES = ["series", "movie", "book", "episode"] as const;

/** İçeriğe ait anketleri, kullanıcının kendi oylarıyla birlikte döner. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // series | movie | book
    const tmdbId = searchParams.get("tmdbId"); // veya book için googleBooksId

    if (!type || !tmdbId) {
      return NextResponse.json(
        { error: "type ve tmdbId gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const query =
      type === "book"
        ? { type: "book", googleBooksId: String(tmdbId) }
        : { type, tmdbId: Number(tmdbId) };

    const content = await Content.findOne(query).lean();

    if (!content) {
      return NextResponse.json({ ok: true, polls: [] });
    }

    const contentId = (content as any)._id;

    const polls = await Poll.find({ contentId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const auth = getAuthUser(req);

    // Kullanıcının bu anketlerdeki oyları
    let myVotes: Record<string, string[]> = {};
    if (auth && polls.length) {
      const votes = await PollVote.find({
        userId: auth.userId,
        pollId: { $in: polls.map((p: any) => p._id) },
      }).lean();

      for (const v of votes) {
        myVotes[(v as any).pollId.toString()] = (v as any).optionIds.map(
          (id: any) => id.toString()
        );
      }
    }

    const result = polls.map((p: any) => {
      const myOptionIds = myVotes[p._id.toString()] ?? null;
      const hasVoted = myOptionIds !== null;

      return {
        id: p._id.toString(),
        question: p.question,
        type: p.type,
        isSpoiler: p.isSpoiler,
        isClosed: p.isClosed,
        season: p.season,
        episode: p.episode,
        totalVotes: p.totalVotes,
        createdAt: p.createdAt,
        creatorId: p.creatorId.toString(),
        options: p.options.map((o: any) => ({
          id: o._id.toString(),
          text: o.text,
          voteCount: o.voteCount,
          // Oy vermeden yüzde gösterme (standart anket davranışı)
          percent:
            hasVoted && p.totalVotes > 0
              ? Math.round((o.voteCount / p.totalVotes) * 100)
              : null,
        })),
        myOptionIds,
        hasVoted,
      };
    });

    return NextResponse.json({ ok: true, polls: result });
  } catch (err) {
    console.error("Anket listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Yeni anket oluşturur. Sadece içeriği izlemiş/okumuş kullanıcı açabilir. */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const {
      type, // series | movie | book
      tmdbId,
      question,
      pollType, // single | multiple | yesno | prediction
      options, // string[]
      isSpoiler,
      season,
      episode,
    } = await req.json();

    // ---- Doğrulama ----
    if (!type || !tmdbId || !question || !pollType) {
      return NextResponse.json(
        { error: "type, tmdbId, question ve pollType gerekli" },
        { status: 400 }
      );
    }

    if (!TARGET_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz içerik tipi" }, { status: 400 });
    }

    if (!POLL_TYPES.includes(pollType)) {
      return NextResponse.json({ error: "Geçersiz anket tipi" }, { status: 400 });
    }

    if (question.trim().length < 3 || question.length > 200) {
      return NextResponse.json(
        { error: "Soru 3-200 karakter olmalı" },
        { status: 400 }
      );
    }

    // yesno hariç seçenek zorunlu
    let finalOptions: { text: string }[];

    if (pollType === "yesno") {
      finalOptions = [{ text: "Evet" }, { text: "Hayır" }];
    } else {
      if (!Array.isArray(options)) {
        return NextResponse.json({ error: "Seçenekler gerekli" }, { status: 400 });
      }

      const cleaned = options
        .map((o: any) => String(o).trim())
        .filter((o: string) => o.length > 0);

      if (cleaned.length < 2 || cleaned.length > 6) {
        return NextResponse.json(
          { error: "2 ile 6 arası seçenek gerekli" },
          { status: 400 }
        );
      }

      if (cleaned.some((o: string) => o.length > 100)) {
        return NextResponse.json(
          { error: "Seçenek en fazla 100 karakter olabilir" },
          { status: 400 }
        );
      }

      finalOptions = cleaned.map((text: string) => ({ text }));
    }

    await connectDB();

    // İçeriği bul/oluştur
    const content = await ensureContent(type, tmdbId);

    // ---- KURAL: Sadece izlemiş/okumuş kullanıcı anket açabilir ----
    // Dizide en az 1 bölüm işaretli VEYA WatchRecord'da tamamlanmış/izleniyor olmalı.
    const record = await WatchRecord.findOne({
      userId: auth.userId,
      contentId: content._id,
    }).lean();

    let hasEngaged = false;

    if (type === "series") {
      const epCount = await EpisodeWatch.countDocuments({
        userId: auth.userId,
        contentId: content._id,
      });
      const status = (record as any)?.status;
      hasEngaged =
        epCount > 0 ||
        ["watching", "up_to_date", "completed", "paused", "dropped"].includes(
          status
        );
    } else {
      const status = (record as any)?.status;
      hasEngaged = ["completed", "reading", "watching"].includes(status);
    }

    if (!hasEngaged) {
      return NextResponse.json(
        { error: "Anket açmak için önce bu içeriği izlemen/okuman gerekli" },
        { status: 403 }
      );
    }

    const poll = await Poll.create({
      creatorId: auth.userId,
      question: question.trim(),
      targetType: episode ? "episode" : type,
      contentId: content._id,
      season: season ?? null,
      episode: episode ?? null,
      type: pollType,
      options: finalOptions,
      isSpoiler: !!isSpoiler,
      totalVotes: 0,
    });

    return NextResponse.json({
      ok: true,
      poll: {
        id: poll._id.toString(),
        question: poll.question,
        type: poll.type,
        isSpoiler: poll.isSpoiler,
        isClosed: false,
        season: poll.season,
        episode: poll.episode,
        totalVotes: 0,
        createdAt: poll.createdAt,
        creatorId: auth.userId,
        options: poll.options.map((o: any) => ({
          id: o._id.toString(),
          text: o.text,
          voteCount: 0,
          percent: null,
        })),
        myOptionIds: null,
        hasVoted: false,
      },
    });
  } catch (err) {
    console.error("Anket oluşturma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}