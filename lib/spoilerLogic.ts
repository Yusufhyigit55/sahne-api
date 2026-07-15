import { EpisodeWatch, WatchRecord, Content, Report, Comment, Ban } from "@/models";
import { getBanDuration } from "@/models";

/**
 * Kullanıcı bu içeriği (veya bölümü) izlemiş mi?
 * Spoiler kararlarının temeli.
 */
export async function hasWatched(
  userId: string,
  contentId: string,
  season?: number,
  episode?: number
): Promise<boolean> {
  // Bölüm bazlı kontrol
  if (season != null && episode != null) {
    const watched = await EpisodeWatch.exists({
      userId,
      contentId,
      season,
      episode,
    });
    return !!watched;
  }

  // İçerik geneli kontrol
  const record = await WatchRecord.findOne({ userId, contentId }).lean();
  if (!record) return false;

  const watchedStatuses = [
    "watching",
    "up_to_date",
    "completed",
    "reading",
    "paused",
    "dropped",
  ];

  return watchedStatuses.includes((record as any).status);
}

/**
 * Bir yorumun spoiler olarak gösterilip gösterilmeyeceğini belirler.
 * Üç kaynak: kullanıcı işareti, editör onayı, topluluk bildirimi.
 */
export function isSpoilerHidden(comment: any, viewerHasWatched: boolean): boolean {
  // İzlemişse hiçbir şey gizlenmez
  if (viewerHasWatched) return false;

  // Kullanıcı kendi işaretlediyse
  if (comment.isSpoiler) return true;

  // Editör onayladıysa
  if (comment.spoilerConfirmedBy) return true;

  // Topluluk bildirdi, incelemede
  if (comment.spoilerPending) return true;

  return false;
}

/**
 * Yorumları görüntüleyene göre işler.
 * Spoiler olanların metnini gizler.
 */
export async function processComments(
  comments: any[],
  viewerId: string | null,
  contentId: string,
  season?: number,
  episode?: number
) {
  let viewerWatched = false;

  if (viewerId) {
    viewerWatched = await hasWatched(viewerId, contentId, season, episode);
  }

  return comments.map((c) => {
    const hidden = isSpoilerHidden(c, viewerWatched);

    return {
      id: c._id,
      user: {
        id: c.userId?._id ?? c.userId,
        username: c.userId?.username ?? "",
        displayName: c.userId?.displayName ?? "",
        avatar: c.userId?.avatar ?? null,
      },
      body: c.body,
      gifUrl: c.gifUrl,
      isSpoiler: c.isSpoiler || !!c.spoilerConfirmedBy || c.spoilerPending,
      isHidden: hidden,
      hasWatched: c.hasWatched,
      likeCount: c.likeCount ?? 0,
      dislikeCount: c.dislikeCount ?? 0,
      replyCount: c.replyCount ?? 0,
      parentId: c.parentId ?? null,
      mentionedUser: c.mentionedUser
        ? {
            username: c.mentionedUser.username,
            displayName: c.mentionedUser.displayName,
          }
        : null,
      isDeleted: c.isDeleted ?? false,
      editedAt: c.editedAt ?? null,
      createdAt: c.createdAt,
      myVote: c.myVote ?? 0,
    };
  });
}

/**
 * Kullanıcının aktif ban'ı var mı?
 * Ban sadece yorum yazmayı engeller.
 */
export async function getActiveBan(userId: string) {
  const ban = await Ban.findOne({
    userId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  return ban;
}

/**
 * Kullanıcıya kademeli ban uygular.
 * 1. ihlal 5 gün, sonra 15 → 30 → 90 → kalıcı.
 */
export async function applyBan(
  userId: string,
  reason: string,
  moderatorId?: string
) {
  const previousBans = await Ban.countDocuments({ userId });
  const banCount = previousBans + 1;
  const durationDays = getBanDuration(banCount);

  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  const ban = await Ban.create({
    userId,
    reason,
    banCount,
    durationDays,
    expiresAt,
    moderatorId: moderatorId ?? null,
    isActive: true,
  });

  return ban;
}

/**
 * Bir yorumun spoiler bildirimi eşiğini kontrol eder.
 * TEK bildirim bile moderatör onayına düşer (karar: 31.3).
 */
export async function checkSpoilerReports(commentId: string) {
  const reportCount = await Report.countDocuments({
    commentId,
    reason: "unmarked_spoiler",
    status: "pending",
  });

  // Tek bildirim bile yeterli — otomatik gizlenmez, incelemeye alınır
  if (reportCount >= 1) {
    await Comment.findByIdAndUpdate(commentId, {
      $set: { spoilerPending: true },
    });
    return true;
  }

  return false;
}