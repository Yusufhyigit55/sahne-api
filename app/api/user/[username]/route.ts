import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, Follow, Block, WatchRecord, Comment, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { IMG } from "@/lib/tmdb";

type Params = { params: Promise<{ username: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { username } = await params;
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

    const u = user as any;
    const auth = getAuthUser(req);
    const isSelf = auth?.userId === u._id.toString();

    // Engelleme kontrolü
    if (auth && !isSelf) {
      const blocked = await Block.findOne({
        type: "block",
        $or: [
          { userId: auth.userId, targetUserId: u._id },
          { userId: u._id, targetUserId: auth.userId },
        ],
      });

      if (blocked) {
        return NextResponse.json(
          { error: "Bu profili görüntüleyemezsin" },
          { status: 403 }
        );
      }
    }

    // Takip durumu
    let followStatus: string | null = null;
    let isMuted = false;

    if (auth && !isSelf) {
      const follow = await Follow.findOne({
        followerId: auth.userId,
        followingId: u._id,
      }).lean();

      followStatus = follow ? (follow as any).status : null;

      const mute = await Block.findOne({
        userId: auth.userId,
        targetUserId: u._id,
        type: "mute",
      });
      isMuted = !!mute;
    }

    // Gizli hesap: takip etmiyorsan detay yok
    const canSeeDetails =
      isSelf || !u.isPrivate || followStatus === "accepted";

    const base = {
      id: u._id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      coverImage: u.coverImage,
      bio: u.bio,
      location: u.location,
      isPrivate: u.isPrivate,
      isSelf,
      followStatus,
      isMuted,
      followers: u.stats?.followers ?? 0,
      following: u.stats?.following ?? 0,
      createdAt: u.createdAt,
    };

    if (!canSeeDetails) {
      return NextResponse.json({
        ok: true,
        user: base,
        locked: true,
      });
    }

    // İstatistik görünürlüğü
    const showStats = isSelf || u.statsPublic;

    // Favoriler
    const favorites = await WatchRecord.find({
      userId: u._id,
      isFavorite: true,
      isHidden: false,
    })
      .limit(20)
      .populate("contentId", "type tmdbId googleBooksId titleTr posterPath")
      .lean();

    const favItems = (favorites as any[])
      .filter((f) => f.contentId)
      .map((f) => ({
        type: f.contentId.type,
        id: f.contentId.tmdbId ?? f.contentId.googleBooksId,
        titleTr: f.contentId.titleTr,
        poster:
          f.contentId.type === "book"
            ? f.contentId.posterPath
            : IMG.poster(f.contentId.posterPath),
      }));

    const commentCount = await Comment.countDocuments({
      userId: u._id,
      isDeleted: false,
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...base,
        stats: showStats
          ? {
              episodesWatched: u.stats?.episodesWatched ?? 0,
              moviesWatched: u.stats?.moviesWatched ?? 0,
              seriesCompleted: u.stats?.seriesCompleted ?? 0,
              booksRead: u.stats?.booksRead ?? 0,
              totalMinutes: u.stats?.totalMinutes ?? 0,
              comments: commentCount,
            }
          : null,
        streak: showStats ? u.streak : null,
        favorites: favItems,
      },
      locked: false,
    });
  } catch (err) {
    console.error("Profil hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}