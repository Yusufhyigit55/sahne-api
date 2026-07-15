import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { WatchRecord, User, BookProgress, EpisodeWatch } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { IMG } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const tab = searchParams.get("tab") ?? "watched";
    const page = Number(searchParams.get("page") ?? 1);
    const limit = 30;

    if (!username) {
      return NextResponse.json({ error: "username gerekli" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({
      username: username.toLowerCase(),
    }).lean();

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const auth = getAuthUser(req);
    const uid = (user as any)._id;
    const isSelf = auth?.userId === uid.toString();

    const filter: any = { userId: uid };

    // Gizli izlemeler sadece kendine görünür
    if (!isSelf) {
      filter.isHidden = false;
    }

    // Sekme
    if (tab === "favorites") {
      filter.isFavorite = true;
    } else if (tab === "watchlist") {
      filter.status = "watchlist";
    } else {
      // İzlenenler: watchlist ve none hariç
      filter.status = { $nin: ["watchlist", "none"] };
    }

    // Durum filtresi
    if (status && status !== "all") {
      filter.status = status;
    }

    const records = await WatchRecord.find(filter)
      .sort({ updatedAt: -1 })
      .populate("contentId")
      .lean();

    // Tür filtresi (populate sonrası)
    const filtered = (records as any[]).filter((r) => {
      if (!r.contentId) return false;
      if (type && type !== "all" && r.contentId.type !== type) return false;
      return true;
    });

    // Sayfalama
    const paged = filtered.slice((page - 1) * limit, page * limit);

    if (paged.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        statusCounts: {},
        total: filtered.length,
        hasMore: false,
      });
    }

    // TEK SORGUDA tüm bölüm sayıları ve kitap ilerlemeleri
    const seriesIds = paged
      .filter((r) => r.contentId.type === "series")
      .map((r) => r.contentId._id);

    const bookIds = paged
      .filter((r) => r.contentId.type === "book")
      .map((r) => r.contentId._id);

    const [episodeCounts, bookProgress] = await Promise.all([
      seriesIds.length
        ? EpisodeWatch.aggregate([
            { $match: { userId: uid, contentId: { $in: seriesIds } } },
            { $group: { _id: "$contentId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      bookIds.length
        ? BookProgress.find({ userId: uid, contentId: { $in: bookIds } })
            .select("contentId percent")
            .lean()
        : Promise.resolve([]),
    ]);

    const epMap = new Map(
      (episodeCounts as any[]).map((e) => [e._id.toString(), e.count])
    );

    const bookMap = new Map(
      (bookProgress as any[]).map((b) => [b.contentId.toString(), b.percent])
    );

    const items = paged.map((r) => {
      const c = r.contentId;
      const cid = c._id.toString();

      let watchedEpisodes = 0;
      let progress = 0;

      if (c.type === "series") {
        watchedEpisodes = epMap.get(cid) ?? 0;
        progress =
          c.totalEpisodes > 0
            ? Math.round((watchedEpisodes / c.totalEpisodes) * 100)
            : 0;
      } else if (c.type === "book") {
        progress = bookMap.get(cid) ?? 0;
      } else if (r.status === "completed") {
        progress = 100;
      }

      return {
        type: c.type,
        id: c.tmdbId ?? c.googleBooksId,
        titleTr: c.titleTr,
        poster: c.type === "book" ? c.posterPath : IMG.poster(c.posterPath),
        year: c.year,
        status: r.status,
        rating: r.rating,
        isFavorite: r.isFavorite,
        isHidden: r.isHidden,
        watchedEpisodes,
        totalEpisodes: c.totalEpisodes ?? 0,
        progress,
        updatedAt: r.updatedAt,
      };
    });

    // Durum sayaçları (filtre çubuğu için)
    const counts = await WatchRecord.aggregate([
      { $match: { userId: uid, ...(isSelf ? {} : { isHidden: false }) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusCounts: Record<string, number> = {};
    for (const c of counts) {
      statusCounts[c._id] = c.count;
    }

    return NextResponse.json({
      ok: true,
      items,
      statusCounts,
      total: filtered.length,
      page,
      hasMore: filtered.length > page * limit,
    });
  } catch (err) {
    console.error("Kütüphane hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}