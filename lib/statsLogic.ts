// lib/statsLogic.ts : Kullanıcının TV Time tarzı detaylı izleme istatistiklerini üretir.
import {
  EpisodeWatch,
  WatchRecord,
  BookProgress,
  Content,
  Comment,
  CharacterVote,
} from "@/models";
import { computeBadges, type EarnedBadge } from "@/lib/badges";

/** Haftalık grafik noktası */
export type WeekPoint = { label: string; value: number };
/** Aylık grafik noktası */
export type MonthPoint = { label: string; value: number };
/** Tür sayımı */
export type GenreCount = { name: string; count: number };
/** Puan dağılımı satırı */
export type RatedItem = { title: string; rating: number };

/** Tek bir medya türü (dizi VEYA film) için istatistik bloğu */
export type MediaStats = {
  // Zaman serileri (son 12 hafta)
  weeklyWatched: WeekPoint[];
  weeklyHours: WeekPoint[];
  // Süre
  totalMinutes: number;
  // Sayılar
  totalWatched: number; // izlenen bölüm / film
  totalAdded: number; // eklenen dizi / film
  stillAiring: number; // yapımda olan (sadece dizi)
  // Türler
  topGenres: GenreCount[];
  // Kalan + yaklaşan (sadece dizi anlamlı; film için boş)
  remaining: number;
  remainingFromCount: number;
  // Puanlar
  topRated: RatedItem[];
  // Sosyal
  commentCount: number;
  likesReceived: number;
  characterVotes: number;
  characterVotedContent: number;
};

export type UserStats = {
  series: MediaStats;
  movies: MediaStats;
  // Genel (profildeki özet kartlar için)
  summary: {
    totalMinutesAll: number;
    episodesWatched: number;
    moviesWatched: number;
    currentStreak: number;
    longestStreak: number;
  };
  badges: EarnedBadge[];
  earnedBadgeCount: number;
};

/** Son 12 haftanın ISO hafta etiketlerini (hafta no) döndürür. */
function lastWeeks(n: number): { start: Date; label: string }[] {
  const out: { start: Date; label: string }[] = [];
  const now = new Date();
  // Bu haftanın pazartesisi
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - (day - 1));

  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    out.push({ start, label: isoWeek(start).toString() });
  }
  return out;
}

/** ISO hafta numarası */
function isoWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

/** Gün bazında streak hesapla */
function calcStreak(dates: Date[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  const days = [
    ...new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10))),
  ].sort();

  let longest = 1;
  let run = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const last = days[days.length - 1];

  let current = 0;
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const a = new Date(days[i]);
      const b = new Date(days[i + 1]);
      const diff = (b.getTime() - a.getTime()) / 86400000;
      if (diff === 1) current++;
      else break;
    }
  }

  return { current, longest };
}

/** Boş medya bloğu */
function emptyMedia(): MediaStats {
  return {
    weeklyWatched: [],
    weeklyHours: [],
    totalMinutes: 0,
    totalWatched: 0,
    totalAdded: 0,
    stillAiring: 0,
    topGenres: [],
    remaining: 0,
    remainingFromCount: 0,
    topRated: [],
    commentCount: 0,
    likesReceived: 0,
    characterVotes: 0,
    characterVotedContent: 0,
  };
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const weeks = lastWeeks(12);

  // 1) Tüm veriyi paralel çek
  const [episodes, records, books, comments, charVotes] = await Promise.all([
    EpisodeWatch.find({ userId })
      .populate("contentId", "type genres")
      .select("contentId season episode watchedAt runtime")
      .lean(),
    WatchRecord.find({ userId })
      .populate(
        "contentId",
        "type tmdbId titleTr genres runtime totalEpisodes isEnded nextEpisodeAir"
      )
      .lean(),
    BookProgress.find({ userId }).populate("contentId", "pageCount").lean(),
    Comment.find({ userId, isDeleted: { $ne: true } })
      .populate("contentId", "type")
      .select("contentId type likeCount")
      .lean(),
    CharacterVote.find({ userId }).populate("contentId", "type").lean(),
  ]);

  const eps = episodes as any[];
  const recs = records as any[];
  const bks = books as any[];
  const cms = comments as any[];
  const cvs = charVotes as any[];

  const series = emptyMedia();
  const movies = emptyMedia();

  // 2) HAFTALIK — bölüm izleme (diziler)
  const epWeekMap = new Map<string, number>();
  const epHourMap = new Map<string, number>();
  for (const e of eps) {
    if (!e.watchedAt) continue;
    const w = isoWeek(new Date(e.watchedAt)).toString();
    epWeekMap.set(w, (epWeekMap.get(w) ?? 0) + 1);
    epHourMap.set(w, (epHourMap.get(w) ?? 0) + (e.runtime ?? 45));
  }
  series.weeklyWatched = weeks.map((w) => ({
    label: w.label,
    value: epWeekMap.get(w.label) ?? 0,
  }));
  series.weeklyHours = weeks.map((w) => ({
    label: w.label,
    value: Math.round((epHourMap.get(w.label) ?? 0) / 60),
  }));

  // 3) HAFTALIK — film izleme
  const completedMovies = recs.filter(
    (r) => r.contentId?.type === "movie" && r.status === "completed"
  );
  const mvWeekMap = new Map<string, number>();
  const mvHourMap = new Map<string, number>();
  for (const r of completedMovies) {
    const date = r.watchedAt ?? r.updatedAt;
    if (!date) continue;
    const w = isoWeek(new Date(date)).toString();
    mvWeekMap.set(w, (mvWeekMap.get(w) ?? 0) + 1);
    mvHourMap.set(w, (mvHourMap.get(w) ?? 0) + (r.contentId.runtime ?? 110));
  }
  movies.weeklyWatched = weeks.map((w) => ({
    label: w.label,
    value: mvWeekMap.get(w.label) ?? 0,
  }));
  movies.weeklyHours = weeks.map((w) => ({
    label: w.label,
    value: Math.round((mvHourMap.get(w.label) ?? 0) / 60),
  }));

  // 4) SÜRE + SAYILAR
  for (const e of eps) series.totalMinutes += e.runtime ?? 45;
  series.totalWatched = eps.length;

  for (const r of completedMovies) {
    movies.totalMinutes += r.contentId.runtime ?? 110;
  }
  movies.totalWatched = completedMovies.length;

  const seriesRecs = recs.filter((r) => r.contentId?.type === "series");
  const movieRecs = recs.filter((r) => r.contentId?.type === "movie");
  series.totalAdded = seriesRecs.length;
  movies.totalAdded = movieRecs.length;
  series.stillAiring = seriesRecs.filter(
    (r) => r.contentId && !r.contentId.isEnded
  ).length;

  // 5) TÜRLER (dizi + film ayrı)
  const sGenre = new Map<string, number>();
  const mGenre = new Map<string, number>();
  for (const r of seriesRecs) {
    for (const g of r.contentId?.genres ?? [])
      sGenre.set(g, (sGenre.get(g) ?? 0) + 1);
  }
  for (const r of movieRecs) {
    for (const g of r.contentId?.genres ?? [])
      mGenre.set(g, (mGenre.get(g) ?? 0) + 1);
  }
  const topN = (m: Map<string, number>): GenreCount[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  series.topGenres = topN(sGenre);
  movies.topGenres = topN(mGenre);

  // 6) KALAN + YAKLAŞAN (diziler)
  const watchingSeries = seriesRecs.filter((r) =>
    ["watching", "up_to_date", "paused"].includes(r.status)
  );
  series.remainingFromCount = watchingSeries.length;

  const watchedByContent = new Map<string, number>();
  for (const e of eps) {
    const cid = e.contentId?._id?.toString() ?? e.contentId?.toString();
    if (cid) watchedByContent.set(cid, (watchedByContent.get(cid) ?? 0) + 1);
  }
  let remaining = 0;
  for (const r of watchingSeries) {
    const total = r.contentId?.totalEpisodes ?? 0;
    const cid = r.contentId?._id?.toString();
    const watched = cid ? watchedByContent.get(cid) ?? 0 : 0;
    remaining += Math.max(0, total - watched);
  }
  series.remaining = remaining;

  

  // 7) PUANLAR — en yüksek verdiğin puanlar
  const ratedSeries = seriesRecs
    .filter((r) => typeof r.rating === "number")
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((r) => ({ title: r.contentId?.titleTr ?? "?", rating: r.rating }));
  const ratedMovies = movieRecs
    .filter((r) => typeof r.rating === "number")
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((r) => ({ title: r.contentId?.titleTr ?? "?", rating: r.rating }));
  series.topRated = ratedSeries;
  movies.topRated = ratedMovies;

  // 8) SOSYAL — yorum sayısı + kazanılan beğeni (dizi/film ayrı)
  for (const c of cms) {
    const t = c.contentId?.type;
    if (t === "series") {
      series.commentCount++;
      series.likesReceived += c.likeCount ?? 0;
    } else if (t === "movie") {
      movies.commentCount++;
      movies.likesReceived += c.likeCount ?? 0;
    }
  }

  // 9) KARAKTER OYLARI (dizi/film ayrı)
  const sVotedContent = new Set<string>();
  const mVotedContent = new Set<string>();
  for (const v of cvs) {
    const t = v.contentId?.type;
    const cid = v.contentId?._id?.toString();
    if (t === "series") {
      series.characterVotes++;
      if (cid) sVotedContent.add(cid);
    } else if (t === "movie") {
      movies.characterVotes++;
      if (cid) mVotedContent.add(cid);
    }
  }
  series.characterVotedContent = sVotedContent.size;
  movies.characterVotedContent = mVotedContent.size;

  // 10) ÖZET (profil kartları)
  const watchDates = eps
    .filter((e) => e.watchedAt)
    .map((e) => new Date(e.watchedAt));
  const { current: currentStreak, longest: longestStreak } =
    calcStreak(watchDates);

  const totalMinutesAll = series.totalMinutes + movies.totalMinutes;

  // 11) ROZETLER
  const distinctGenres = new Set<string>([
    ...sGenre.keys(),
    ...mGenre.keys(),
  ]).size;
  const booksActive = bks.some((b) => (b.percent ?? 0) > 0);
  const { badges, earnedCount } = computeBadges({
    episodesWatched: series.totalWatched,
    moviesWatched: movies.totalWatched,
    seriesCompleted: seriesRecs.filter((r) =>
      ["completed", "up_to_date"].includes(r.status)
    ).length,
    longestStreak,
    commentCount: series.commentCount + movies.commentCount,
    likesReceived: series.likesReceived + movies.likesReceived,
    characterVotes: series.characterVotes + movies.characterVotes,
    distinctGenres,
    activeInSeries: series.totalWatched > 0,
    activeInMovies: movies.totalWatched > 0,
    activeInBooks: booksActive,
  });

  return {
    series,
    movies,
    summary: {
      totalMinutesAll,
      episodesWatched: series.totalWatched,
      moviesWatched: movies.totalWatched,
      currentStreak,
      longestStreak,
    },
    badges,
    earnedBadgeCount: earnedCount,
  };
}
