import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Comment, CommentVote, Content, User } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent, logActivity } from "@/lib/watchLogic";
import {
  hasWatched,
  processComments,
  getActiveBan,
} from "@/lib/spoilerLogic";

/** Yorum oluştur */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    // Ban kontrolü — banlı kullanıcı yorum yazamaz
    const ban = await getActiveBan(auth.userId);
    if (ban) {
      const until = (ban as any).expiresAt
        ? new Date((ban as any).expiresAt).toLocaleDateString("tr-TR")
        : "kalıcı olarak";
      return NextResponse.json(
        {
          error: `Yorum yazma hakkın askıya alındı (${until}).`,
          ban: { reason: (ban as any).reason, expiresAt: (ban as any).expiresAt },
        },
        { status: 403 }
      );
    }

    const {
      targetType,
      contentId: externalId,
      season,
      episode,
      body,
      gifUrl,
      isSpoiler,
      parentId,
    } = await req.json();

    if (!targetType || !externalId) {
      return NextResponse.json(
        { error: "targetType ve contentId gerekli" },
        { status: 400 }
      );
    }

    if (!body?.trim() && !gifUrl) {
      return NextResponse.json(
        { error: "Yorum boş olamaz" },
        { status: 400 }
      );
    }

    if (body && body.length > 2000) {
      return NextResponse.json(
        { error: "Yorum en fazla 2000 karakter olabilir" },
        { status: 400 }
      );
    }

    // İçeriği bul/oluştur
    const contentType =
      targetType === "episode" ? "series" : targetType;
    const content = await ensureContent(contentType as any, externalId);

    // Yorumu yazan içeriği izlemiş mi? (denormalize — rozet için)
    const watched = await hasWatched(
      auth.userId,
      content._id.toString(),
      targetType === "episode" ? season : undefined,
      targetType === "episode" ? episode : undefined
    );

    // Yanıt mı? Ana yorumu bul
    let mentionedUser = null;
    let finalParentId = null;

    if (parentId) {
      const parent = await Comment.findById(parentId).lean();
      if (!parent) {
        return NextResponse.json(
          { error: "Yanıtlanan yorum bulunamadı" },
          { status: 404 }
        );
      }

      // İki seviye kuralı: yanıta yanıt verilirse yine ana yorumun altına
      finalParentId = (parent as any).parentId ?? parentId;
      mentionedUser = (parent as any).userId;
    }

    const comment = await Comment.create({
      userId: auth.userId,
      targetType,
      contentId: content._id,
      season: targetType === "episode" ? season : null,
      episode: targetType === "episode" ? episode : null,
      body: body?.trim() ?? "",
      gifUrl: gifUrl ?? null,
      isSpoiler: !!isSpoiler,
      hasWatched: watched,
      parentId: finalParentId,
      mentionedUser,
    });

    // Ana yorumun yanıt sayacını artır
    if (finalParentId) {
      await Comment.findByIdAndUpdate(finalParentId, {
        $inc: { replyCount: 1 },
      });
    } else {
      await logActivity(auth.userId, "commented", content._id.toString(), {
        title: content.titleTr,
        targetType,
        season,
        episode,
      });
    }

    const populated = await Comment.findById(comment._id)
      .populate("userId", "username displayName avatar")
      .populate("mentionedUser", "username displayName")
      .lean();

    const [processed] = await processComments(
      [populated],
      auth.userId,
      content._id.toString(),
      season,
      episode
    );

    return NextResponse.json({ ok: true, comment: processed }, { status: 201 });
  } catch (err) {
    console.error("Yorum oluşturma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Yorumları listele */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const externalId = searchParams.get("contentId");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");
    const sort = searchParams.get("sort") ?? "popular"; // popular | new | following
    const page = Number(searchParams.get("page") ?? 1);

    if (!targetType || !externalId) {
      return NextResponse.json(
        { error: "targetType ve contentId gerekli" },
        { status: 400 }
      );
    }

    await connectDB();

    const contentType = targetType === "episode" ? "series" : targetType;
    const query =
      contentType === "book"
        ? { type: contentType, googleBooksId: externalId }
        : { type: contentType, tmdbId: Number(externalId) };

    const content = await Content.findOne(query).lean();

    if (!content) {
      return NextResponse.json({ ok: true, comments: [], total: 0 });
    }

    const auth = getAuthUser(req);
    const cid = (content as any)._id;

    // Filtre
    const filter: any = {
      contentId: cid,
      targetType,
      parentId: null, // sadece ana yorumlar
    };

    if (targetType === "episode") {
      filter.season = Number(season);
      filter.episode = Number(episode);
    }

    // Sıralama
    let sortSpec: any = { createdAt: -1 };

    if (sort === "popular") {
      // Beğeni farkı + izlemiş olan bonusu
      sortSpec = { likeCount: -1, createdAt: -1 };
    }

    const limit = 20;
    const comments = await Comment.find(filter)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "username displayName avatar")
      .populate("mentionedUser", "username displayName")
      .lean();

    // Kullanıcının oyları
    if (auth && comments.length) {
      const votes = await CommentVote.find({
        userId: auth.userId,
        commentId: { $in: comments.map((c: any) => c._id) },
      }).lean();

      const voteMap = new Map(
        votes.map((v: any) => [v.commentId.toString(), v.value])
      );

      for (const c of comments as any[]) {
        c.myVote = voteMap.get(c._id.toString()) ?? 0;
      }
    }

    const total = await Comment.countDocuments(filter);

    // Yanıtlar dahil toplam
    const totalWithReplies = await Comment.countDocuments({
      contentId: cid,
      targetType,
      ...(targetType === "episode"
        ? { season: Number(season), episode: Number(episode) }
        : {}),
    });

    const processed = await processComments(
      comments,
      auth?.userId ?? null,
      cid.toString(),
      targetType === "episode" ? Number(season) : undefined,
      targetType === "episode" ? Number(episode) : undefined
    );

    // Görüntüleyen içeriği izlemiş mi? (uyarı bandı için)
    let viewerWatched = false;
    if (auth) {
      viewerWatched = await hasWatched(
        auth.userId,
        cid.toString(),
        targetType === "episode" ? Number(season) : undefined,
        targetType === "episode" ? Number(episode) : undefined
      );
    }

    return NextResponse.json({
      ok: true,
      comments: processed,
      total,
      totalWithReplies,
      page,
      hasMore: total > page * limit,
      viewerWatched,
    });
  } catch (err) {
    console.error("Yorum listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}