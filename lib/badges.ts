// lib/badges.ts : Rozet tanımları ve kullanıcının kazandığı rozetleri hesaplama.

export type BadgeCategory =
  | "milestone"
  | "completion"
  | "streak"
  | "social"
  | "variety";

export type BadgeDef = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  category: BadgeCategory;
};

/** Rozet hesabı için gereken ham veriler. */
export type BadgeInput = {
  episodesWatched: number;
  moviesWatched: number;
  seriesCompleted: number;
  longestStreak: number;
  commentCount: number;
  likesReceived: number;
  characterVotes: number;
  distinctGenres: number;
  activeInSeries: boolean;
  activeInMovies: boolean;
  activeInBooks: boolean;
};

/** Tüm rozet tanımları + kazanma koşulu. */
const BADGES: (BadgeDef & { earned: (i: BadgeInput) => boolean })[] = [
  // ── Kilometre taşları ──
  {
    key: "first_step",
    emoji: "🌱",
    title: "İlk Adım",
    description: "İlk bölümünü izledin",
    category: "milestone",
    earned: (i) => i.episodesWatched >= 1,
  },
  {
    key: "series_addict",
    emoji: "📺",
    title: "Dizi Kurdu",
    description: "100 bölüm izledin",
    category: "milestone",
    earned: (i) => i.episodesWatched >= 100,
  },
  {
    key: "marathoner",
    emoji: "🏆",
    title: "Maratoncu",
    description: "1000 bölüm izledin",
    category: "milestone",
    earned: (i) => i.episodesWatched >= 1000,
  },
  {
    key: "cinephile",
    emoji: "🎬",
    title: "Sinefil",
    description: "50 film izledin",
    category: "milestone",
    earned: (i) => i.moviesWatched >= 50,
  },
  {
    key: "film_master",
    emoji: "🎭",
    title: "Film Ustası",
    description: "200 film izledin",
    category: "milestone",
    earned: (i) => i.moviesWatched >= 200,
  },

  // ── Tamamlama ──
  {
    key: "finisher",
    emoji: "✅",
    title: "Bitirici",
    description: "İlk diziyi bitirdin",
    category: "completion",
    earned: (i) => i.seriesCompleted >= 1,
  },
  {
    key: "series_slayer",
    emoji: "👑",
    title: "Seri Katili",
    description: "10 dizi bitirdin",
    category: "completion",
    earned: (i) => i.seriesCompleted >= 10,
  },
  {
    key: "collector",
    emoji: "💯",
    title: "Koleksiyoncu",
    description: "50 dizi bitirdin",
    category: "completion",
    earned: (i) => i.seriesCompleted >= 50,
  },

  // ── Süreklilik ──
  {
    key: "on_fire",
    emoji: "🔥",
    title: "Alevlendi",
    description: "7 günlük seri",
    category: "streak",
    earned: (i) => i.longestStreak >= 7,
  },
  {
    key: "unstoppable",
    emoji: "⚡",
    title: "Durdurulamaz",
    description: "30 günlük seri",
    category: "streak",
    earned: (i) => i.longestStreak >= 30,
  },

  // ── Sosyal ──
  {
    key: "critic",
    emoji: "✍️",
    title: "Eleştirmen",
    description: "İlk yorumunu yaptın",
    category: "social",
    earned: (i) => i.commentCount >= 1,
  },
  {
    key: "beloved",
    emoji: "❤️",
    title: "Sevilen",
    description: "Yorumların 100 beğeni aldı",
    category: "social",
    earned: (i) => i.likesReceived >= 100,
  },
  {
    key: "voter",
    emoji: "🗳️",
    title: "Seçmen",
    description: "50 karaktere oy verdin",
    category: "social",
    earned: (i) => i.characterVotes >= 50,
  },

  // ── Çeşitlilik ──
  {
    key: "explorer",
    emoji: "🌈",
    title: "Kâşif",
    description: "10 farklı tür izledin",
    category: "variety",
    earned: (i) => i.distinctGenres >= 10,
  },
  {
    key: "versatile",
    emoji: "📚",
    title: "Çok Yönlü",
    description: "Dizi, film ve kitap — üçünde de aktifsin",
    category: "variety",
    earned: (i) => i.activeInSeries && i.activeInMovies && i.activeInBooks,
  },
];

export type EarnedBadge = BadgeDef & { earned: boolean };

/** Kullanıcının tüm rozetlerini (kazanılan + kilitli) döndürür. */
export function computeBadges(input: BadgeInput): {
  badges: EarnedBadge[];
  earnedCount: number;
} {
  const badges: EarnedBadge[] = BADGES.map((b) => ({
    key: b.key,
    emoji: b.emoji,
    title: b.title,
    description: b.description,
    category: b.category,
    earned: b.earned(input),
  }));

  const earnedCount = badges.filter((b) => b.earned).length;

  return { badges, earnedCount };
}