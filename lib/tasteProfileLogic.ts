// lib/tasteProfileLogic.ts : Kullanıcının izleme verisinden davranışsal "zevk profili" içgörüleri üretir.
import { WatchRecord } from "@/models";

export type TasteInsight = {
  key: string;
  emoji: string;
  title: string;
  detail: string;
};

export type TasteProfile = {
  insights: TasteInsight[];
  needsMoreData: boolean;
};

export async function getTasteProfile(userId: string): Promise<TasteProfile> {
  const records = await WatchRecord.find({ userId })
    .populate("contentId", "type year genres")
    .lean();

  const recs = (records as any[]).filter((r) => r.contentId);

  const insights: TasteInsight[] = [];

  const meaningful = recs.filter(
    (r) =>
      r.status !== "none" ||
      r.isLiked ||
      r.isFavorite ||
      r.rating != null
  );

  if (meaningful.length < 5) {
    return { insights: [], needsMoreData: true };
  }

  // 1) PUAN CÖMERTLİĞİ
  const rated = recs.filter((r) => typeof r.rating === "number");
  if (rated.length >= 3) {
    const avg = rated.reduce((sum, r) => sum + r.rating, 0) / rated.length;
    const avgR = Number(avg.toFixed(1));
    let title: string;
    let detail: string;
    if (avg >= 8) {
      title = "Cömert Puanlayıcı";
      detail = `Ortalama ${avgR}/10 veriyorsun — izlediklerini genelde seviyorsun.`;
    } else if (avg >= 6.5) {
      title = "Dengeli Eleştirmen";
      detail = `Ortalama ${avgR}/10 — adil ve dengeli puanlıyorsun.`;
    } else {
      title = "Seçici Göz";
      detail = `Ortalama ${avgR}/10 — kolay etkilenmiyorsun, seçicisin.`;
    }
    insights.push({ key: "rating", emoji: "⭐", title, detail });
  }

  // 2) İÇERİK DENGESİ
  const typeCounts = { series: 0, movie: 0, book: 0 };
  for (const r of meaningful) {
    const t = r.contentId?.type;
    if (t === "series") typeCounts.series++;
    else if (t === "movie") typeCounts.movie++;
    else if (t === "book") typeCounts.book++;
  }
  const totalTyped = typeCounts.series + typeCounts.movie + typeCounts.book;
  if (totalTyped >= 5) {
    const sPct = Math.round((typeCounts.series / totalTyped) * 100);
    const mPct = Math.round((typeCounts.movie / totalTyped) * 100);
    const bPct = Math.round((typeCounts.book / totalTyped) * 100);
    const dominant = Math.max(sPct, mPct, bPct);
    let title: string;
    let detail: string;
    if (dominant >= 70) {
      if (dominant === sPct) {
        title = "Dizi Bağımlısı";
        detail = `Zamanının %${sPct}'i dizilerde — bir hikâyeye bağlanmayı seviyorsun.`;
      } else if (dominant === mPct) {
        title = "Film Tutkunu";
        detail = `Zamanının %${mPct}'i filmlerde — tek oturumluk hikâyeler senlik.`;
      } else {
        title = "Kitap Kurdu";
        detail = `Zamanının %${bPct}'i kitaplarda — sayfalar arasında kayboluyorsun.`;
      }
    } else {
      title = "Çok Yönlü İzleyici";
      detail = `Dizi %${sPct} · Film %${mPct} · Kitap %${bPct} — dengeli bir tüketicisin.`;
    }
    insights.push({ key: "balance", emoji: "🎭", title, detail });
  }

  // 3) TAMAMLAMA EĞİLİMİ
  const seriesRecs = meaningful.filter((r) => r.contentId?.type === "series");
  const startedSeries = seriesRecs.filter((r) =>
    ["watching", "up_to_date", "completed", "paused", "dropped"].includes(r.status)
  );
  if (startedSeries.length >= 4) {
    const finished = startedSeries.filter((r) =>
      ["completed", "up_to_date"].includes(r.status)
    ).length;
    const rate = Math.round((finished / startedSeries.length) * 100);
    let title: string;
    let detail: string;
    if (rate >= 75) {
      title = "Bitiren İnsan";
      detail = `Başladığın dizilerin %${rate}'ini tamamlıyorsun — kararlısın.`;
    } else if (rate >= 45) {
      title = "Seçerek Bitiren";
      detail = `Dizilerin %${rate}'ini bitiriyorsun — sadece hak edeni sonuna kadar izliyorsun.`;
    } else {
      title = "Kâşif Ruhu";
      detail = `Çok dizi deniyorsun, %${rate}'ini bitiriyorsun — yeniyi keşfetmeyi seviyorsun.`;
    }
    insights.push({ key: "completion", emoji: "🎯", title, detail });
  }

  // 4) DÖNEM TERCİHİ
  const withYear = meaningful.filter(
    (r) => typeof r.contentId?.year === "number" && r.contentId.year > 1900
  );
  if (withYear.length >= 5) {
    const avgYear = Math.round(
      withYear.reduce((sum, r) => sum + r.contentId.year, 0) / withYear.length
    );
    const currentYear = new Date().getFullYear();
    let title: string;
    let detail: string;
    if (avgYear >= currentYear - 5) {
      title = "Güncel Takipçi";
      detail = `Çoğunlukla son çıkanları izliyorsun (ort. ${avgYear}) — trendleri kaçırmıyorsun.`;
    } else if (avgYear >= 2005) {
      title = "Modern Klasik Sever";
      detail = `Ortalama ${avgYear} yapımı içerikler — modern klasiklere yakınsın.`;
    } else {
      title = "Nostalji Ustası";
      detail = `Ortalama ${avgYear} — eski yapımların değerini biliyorsun.`;
    }
    insights.push({ key: "era", emoji: "📅", title, detail });
  }

  // 5) TÜR ÇEŞİTLİLİĞİ
  const genreSet = new Set<string>();
  let genreItemCount = 0;
  for (const r of meaningful) {
    const genres: string[] = r.contentId?.genres ?? [];
    if (genres.length > 0) {
      genreItemCount++;
      for (const g of genres) genreSet.add(g);
    }
  }
  if (genreItemCount >= 5) {
    const variety = genreSet.size;
    let title: string;
    let detail: string;
    if (variety >= 10) {
      title = "Tür Kâşifi";
      detail = `${variety} farklı türde içerik izledin — meraklı ve açık fikirlisin.`;
    } else if (variety >= 5) {
      title = "Dengeli Damak";
      detail = `${variety} farklı tür — çeşitliliği seviyorsun ama favorilerinden de şaşmıyorsun.`;
    } else {
      title = "Sadık Zevk";
      detail = `${variety} türe odaklısın — ne sevdiğini net biliyorsun.`;
    }
    insights.push({ key: "variety", emoji: "🌈", title, detail });
  }

  return {
    insights,
    needsMoreData: insights.length === 0,
  };
}
