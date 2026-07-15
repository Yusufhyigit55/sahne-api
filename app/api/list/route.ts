// app/api/list/route.ts : Kullanıcının kendi listelerini getirir (GET) ve yeni liste oluşturur (POST).
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { List, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Bir kullanıcının listeleri. userId verilmezse kendi listelerin. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    const auth = getAuthUser(req);

    // Hedef yoksa giriş yapan kullanıcının listeleri
    const ownerId = targetUserId ?? auth?.userId;
    if (!ownerId) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    const isOwner = auth?.userId === ownerId;

    // Başkasının listelerine bakılıyorsa sadece herkese açık olanlar
    const query: Record<string, any> = { userId: ownerId };
    if (!isOwner) query.isPublic = true;

    const lists = await List.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Her liste için ilk 4 içeriğin posterini çek (kapak kolajı)
    const result = [];
    for (const l of lists as any[]) {
      const firstIds = l.items
        .slice(0, 4)
        .map((it: any) => it.contentId);

      const covers = await Content.find({ _id: { $in: firstIds } })
        .select("posterPath type")
        .lean();

      result.push({
        id: l._id.toString(),
        title: l.title,
        description: l.description,
        isPublic: l.isPublic,
        itemCount: l.items.length,
        favoriteCount: l.favoriteCount,
        covers: covers.map((c: any) => c.posterPath).filter(Boolean),
        createdAt: l.createdAt,
      });
    }

    return NextResponse.json({ ok: true, lists: result, isOwner });
  } catch (err) {
    console.error("Liste listeleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Yeni liste oluştur. */
export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { title, description, isPublic } = await req.json();

    if (!title || title.trim().length < 2) {
      return NextResponse.json(
        { error: "Başlık en az 2 karakter olmalı" },
        { status: 400 }
      );
    }

    if (title.length > 80) {
      return NextResponse.json(
        { error: "Başlık en fazla 80 karakter olabilir" },
        { status: 400 }
      );
    }

    await connectDB();

    const list = await List.create({
      userId: auth.userId,
      title: title.trim(),
      description: (description ?? "").trim().slice(0, 300),
      isPublic: isPublic ?? true,
      items: [],
    });

    return NextResponse.json({
      ok: true,
      list: {
        id: list._id.toString(),
        title: list.title,
        description: list.description,
        isPublic: list.isPublic,
        itemCount: 0,
        favoriteCount: 0,
        covers: [],
        createdAt: list.createdAt,
      },
    });
  } catch (err) {
    console.error("Liste oluşturma hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}