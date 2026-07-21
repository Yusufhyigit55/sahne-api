import { WatchRecord, Follow, Block, User, Content } from "@/models";
import { Types } from "mongoose";
import { IMG } from "@/lib/tmdb";

export type Compatibility = {
  score: number;
  sharedCount: number;
  sharedContents: {
    type: string;
    id: string | number;
    titleTr: string;
    poster: string | null;
    myRating: number | null;
    theirRating: number | null;
  }[];
  topSharedGenres: string[];
  verdict: string;
};

export type SuggestedUser = {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  isPrivate: boolean;
  followers: number;
  compatibility: number;
  sharedCount: number;
  reason: string;
};

/** Uyum skorunu yorumla */
function verdictFor(score: number, shared: number): string {
  if (shared < 3) return "Henüz yeterli ortak içerik yok";
  if (score >= 85) return "Zevkleriniz neredeyse aynı";
  if (score >= 70) return "Çok uyumlusunuz";
  if (score >= 55) return "Ortak noktanız çok";
  if (score >= 40) return "Bazı ortak zevkleriniz var";
  if (score >= 25) return "Farklı zevkleriniz var";
  return "Zevkleriniz pek uyuşmuyor";
}

/**
 * İki kullanıcı arasındaki uyum.
 * Ortak izlenen içerikler + puan yakınlığı + tür örtüşmesi.
 */
export async function getCompatibility(
  userId: string,
  targetId: string
): Promise<Compatibility> {
  const [mine, theirs] = await Promise.all([
    WatchRecord.find({
      userId,
      status: { $nin: ["none", "watchlist"] },
    })
      .populate("contentId", "type tmdbId googleBooksId titleTr posterPath genres")
      .lean(),
    WatchRecord.find({
      userId: targetId,
      status: { $nin: ["none", "watchlist"] },
    })
      .populate("contentId", "type tmdbId googleBooksId titleTr posterPath genres")
      .lean(),
  ]);

  const myMap = new Map<string, any>();
  const myGenres = new Map<string, number>();

  for (const r of mine as any[]) {
    if (!r.contentId) continue;
    myMap.set(r.contentId._id.toString(), r);
    for (const g of r.contentId.genres ?? []) {
      myGenres.set(g, (myGenres.get(g) ?? 0) + 1);
    }
  }

  const theirGenres = new Map<string, number>();
  const shared: Compatibility["sharedContents"] = [];

  let ratingDiffSum = 0;
  let ratingPairs = 0;
  let reactionMatchBonus = 0;
  let bothFavorite = 0;

  for (const r of theirs as any[]) {
    if (!r.contentId) continue;
    const cid = r.contentId._id.toString();

    for (const g of r.contentId.genres ?? []) {
      theirGenres.set(g, (theirGenres.get(g) ?? 0) + 1);
    }

    const myRec = myMap.get(cid);
    if (!myRec) continue;

    const c = r.contentId;
    shared.push({
      type: c.type,
      id: c.tmdbId ?? c.googleBooksId,
      titleTr: c.titleTr,
      poster: c.type === "book" ? c.posterPath : IMG.poster(c.posterPath),
      myRating: myRec.rating ?? null,
      theirRating: r.rating ?? null,
    });

    // Puan yakınlığı
    if (myRec.rating != null && r.rating != null) {
      ratingDiffSum += Math.abs(myRec.rating - r.rating);
      ratingPairs++;
    }

    // Reaksiyon örtüşmesi — ortak içerikte aynı reaksiyonu verdiyseniz bonus
    const myReactions: string[] = myRec.reactions ?? [];
    const theirReactions: string[] = r.reactions ?? [];
    if (myReactions.length && theirReactions.length) {
      const inter = myReactions.filter((x) => theirReactions.includes(x));
      if (inter.length > 0) reactionMatchBonus += 1;
    }

    // İkinizin de favorisi
    if (myRec.isFavorite && r.isFavorite) bothFavorite += 1;
  }

  const sharedCount = shared.length;
  const myTotal = myMap.size;
  const theirTotal = (theirs as any[]).filter((r) => r.contentId).length;

  if (myTotal === 0 || theirTotal === 0 || sharedCount === 0) {
    return {
      score: 0,
      sharedCount: 0,
      sharedContents: [],
      topSharedGenres: [],
      verdict: verdictFor(0, 0),
    };
  }

  // 1) Örtüşme — küçük olanın kaçını paylaşıyorsunuz (overlap coefficient).
  // Jaccard yerine bunu kullanıyoruz: aktif kullanıcılar cezalanmasın.
  const smaller = Math.min(myTotal, theirTotal);
  const overlap = smaller > 0 ? sharedCount / smaller : 0;

  // 2) Puan yakınlığı — ortalama fark 0 → 1.0, fark 9 → 0.0
  const ratingSim =
    ratingPairs > 0 ? Math.max(0, 1 - ratingDiffSum / ratingPairs / 9) : 0.5;

  // 3) Tür örtüşmesi
  const myTopGenres = new Set(
    [...myGenres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g)
  );
  const theirTopGenres = [...theirGenres.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);
  const sharedGenres = theirTopGenres.filter((g) => myTopGenres.has(g));
  const genreSim = myTopGenres.size > 0 ? sharedGenres.length / 5 : 0;

  // 4) Bonuslar — reaksiyon ve ortak favori (normalize, küçük katkı)
  const reactionSim =
    sharedCount > 0 ? Math.min(1, reactionMatchBonus / sharedCount) : 0;
  const favoriteBonus = Math.min(0.1, bothFavorite * 0.05); // max +%10

  // Ham skor: örtüşme %35 + puan yakınlığı %35 + tür %20 + reaksiyon %10 (+favori bonus)
  let raw =
    overlap * 0.35 + ratingSim * 0.35 + genreSim * 0.2 + reactionSim * 0.1;
  raw = Math.min(1, raw + favoriteBonus);

  // 5) Güven faktörü — az ortak içerikte skoru törpüle (yanıltıcı yüksek skor olmasın).
  // 1 ortak → %55, 3 ortak → %80, 5+ ortak → tam güven.
  const confidence = Math.min(1, 0.4 + sharedCount * 0.12);

  const score = Math.round(raw * confidence * 100);

  // Ortak favori + yüksek puanlıları öne al
  shared.sort((a, b) => {
    const aScore = (a.myRating ?? 0) + (a.theirRating ?? 0);
    const bScore = (b.myRating ?? 0) + (b.theirRating ?? 0);
    return bScore - aScore;
  });

  return {
    score: Math.min(100, score),
    sharedCount,
    sharedContents: shared.slice(0, 12),
    topSharedGenres: sharedGenres,
    verdict: verdictFor(score, sharedCount),
  };
}
export async function getSuggestedUsers(

  userId: string,
  limit = 10
): Promise<SuggestedUser[]> {
  // 1) Benim beğendiklerim
  const myRecords = await WatchRecord.find({
    userId,
    $or: [{ rating: { $gte: 7 } }, { isLiked: true }, { isFavorite: true }],
  })
    .select("contentId")
    .lean();

  const myContentIds = (myRecords as any[]).map((r) => r.contentId);

  if (myContentIds.length < 3) return [];

  // 2) Takip ettiklerim + engellediklerim
  const [follows, blocks] = await Promise.all([
    Follow.find({ followerId: userId }).select("followingId").lean(),
    Block.find({
      $or: [{ userId }, { targetUserId: userId }],
    }).lean(),
  ]);

  const excludeIds = [
    new Types.ObjectId(userId),
    ...(follows as any[]).map((f) => f.followingId),
    ...(blocks as any[]).flatMap((b) => [b.userId, b.targetUserId]),
  ];

  // 3) Aynı içerikleri beğenen kullanıcıları bul
  const candidates = await WatchRecord.aggregate([
    {
      $match: {
        contentId: { $in: myContentIds },
        userId: { $nin: excludeIds },
        $or: [{ rating: { $gte: 7 } }, { isLiked: true }, { isFavorite: true }],
      },
    },
    {
      $group: {
        _id: "$userId",
        sharedCount: { $sum: 1 },
      },
    },
    { $match: { sharedCount: { $gte: 2 } } },
    { $sort: { sharedCount: -1 } },
    { $limit: limit * 2 },
  ]);

  if (candidates.length === 0) return [];

  const userIds = candidates.map((c) => c._id);

  const users = await User.find({ _id: { $in: userIds } })
    .select("username displayName avatar isPrivate stats.followers")
    .lean();

  const userMap = new Map(
    (users as any[]).map((u) => [u._id.toString(), u])
  );

  const items: SuggestedUser[] = [];

  for (const c of candidates) {
    const u = userMap.get(c._id.toString());
    if (!u) continue;

    // Uyum skorunu hesapla
    const compat = await getCompatibility(userId, c._id.toString());

    if (compat.score < 20) continue;

    items.push({
      id: u._id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      isPrivate: u.isPrivate,
      followers: u.stats?.followers ?? 0,
      compatibility: compat.score,
      sharedCount: compat.sharedCount,
      reason:
        compat.topSharedGenres.length > 0
          ? `${compat.topSharedGenres.slice(0, 2).join(", ")} seviyor`
          : `${compat.sharedCount} ortak içerik`,
    });

    if (items.length >= limit) break;
  }

  return items.sort((a, b) => b.compatibility - a.compatibility);
}