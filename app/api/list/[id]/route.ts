// app/api/list/[id]/route.ts : Liste detayı (GET), düzenleme/item ekle-çıkar/favorile (PATCH) ve silme (DELETE).
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { List, Content } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { ensureContent } from "@/lib/watchLogic";

type Params = { params: Promise<{ id: string }> };

/** Liste detayı — içeriklerin tam bilgisiyle. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = getAuthUser(req);

    await connectDB();

    const list = await List.findById(id).lean();
    if (!list) {
      return NextResponse.json({ error: "Liste bulunamadı" }, { status: 404 });
    }

    const l = list as any;
    const isOwner = auth?.userId === l.userId.toString();

    // Gizli listeyi sadece sahibi görebilir
    if (!l.isPublic && !isOwner) {
      return NextResponse.json({ error: "Bu liste gizli" }, { status: 403 });
    }

    // İçerikleri sıraya göre çek
    const sorted = [...l.items].sort((a: any, b: any) => a.order - b.order);
    const contentIds = sorted.map((it: any) => it.contentId);

    const contents = await Content.find({ _id: { $in: contentIds } }).lean();
    const contentMap = new Map(
      contents.map((c: any) => [c._id.toString(), c])
    );

    const items = sorted
      .map((it: any) => {
        const c = contentMap.get(it.contentId.toString());
        if (!c) return null;
        return {
          contentId: it.contentId.toString(),
          note: it.note,
          order: it.order,
          type: c.type,
          tmdbId: c.tmdbId ?? c.googleBooksId,
          title: c.titleTr,
          poster: c.posterPath,
          year: c.year,
        };
      })
      .filter(Boolean);

    const isFavorited = auth
      ? l.favoritedBy.some((u: any) => u.toString() === auth.userId)
      : false;

    return NextResponse.json({
      ok: true,
      list: {
        id: l._id.toString(),
        title: l.title,
        description: l.description,
        isPublic: l.isPublic,
        favoriteCount: l.favoriteCount,
        isFavorited,
        isOwner,
        userId: l.userId.toString(),
        items,
        createdAt: l.createdAt,
      },
    });
  } catch (err) {
    console.error("Liste detay hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/**
 * Liste güncelle. action ile:
 *  - "edit"       → title/description/isPublic
 *  - "add_item"   → { type, tmdbId, note? }
 *  - "remove_item"→ { contentId }
 *  - "favorite"   → favori ekle/çıkar (toggle)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    await connectDB();

    const list = await List.findById(id);
    if (!list) {
      return NextResponse.json({ error: "Liste bulunamadı" }, { status: 404 });
    }

    const isOwner = list.userId.toString() === auth.userId;

    // ---- Favorile (sahip olmayan da yapabilir) ----
    if (action === "favorite") {
      if (isOwner) {
        return NextResponse.json(
          { error: "Kendi listeni favorileyemezsin" },
          { status: 400 }
        );
      }

      const already = list.favoritedBy.some(
        (u: any) => u.toString() === auth.userId
      );

      if (already) {
        list.favoritedBy = list.favoritedBy.filter(
          (u: any) => u.toString() !== auth.userId
        );
        list.favoriteCount = Math.max(0, list.favoriteCount - 1);
      } else {
        list.favoritedBy.push(auth.userId as any);
        list.favoriteCount += 1;
      }

      await list.save();
      return NextResponse.json({
        ok: true,
        isFavorited: !already,
        favoriteCount: list.favoriteCount,
      });
    }

    // ---- Bundan sonrası sadece sahibi ----
    if (!isOwner) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    // ---- Düzenle ----
    if (action === "edit") {
      const { title, description, isPublic } = body;

      if (title != null) {
        if (title.trim().length < 2 || title.length > 80) {
          return NextResponse.json(
            { error: "Başlık 2-80 karakter olmalı" },
            { status: 400 }
          );
        }
        list.title = title.trim();
      }
      if (description != null) {
        list.description = description.trim().slice(0, 300);
      }
      if (isPublic != null) {
        list.isPublic = isPublic;
      }

      await list.save();
      return NextResponse.json({ ok: true });
    }

    // ---- İçerik ekle ----
    if (action === "add_item") {
      const { type, tmdbId, note } = body;

      if (!type || !tmdbId) {
        return NextResponse.json(
          { error: "type ve tmdbId gerekli" },
          { status: 400 }
        );
      }

      const content = await ensureContent(type, tmdbId);

      const exists = list.items.some(
        (it: any) => it.contentId.toString() === content._id.toString()
      );
      if (exists) {
        return NextResponse.json(
          { error: "Bu içerik zaten listede" },
          { status: 400 }
        );
      }

      const maxOrder = list.items.reduce(
        (m: number, it: any) => Math.max(m, it.order),
        -1
      );

      list.items.push({
        contentId: content._id,
        order: maxOrder + 1,
        note: (note ?? "").slice(0, 200),
      } as any);

      await list.save();
      return NextResponse.json({ ok: true, itemCount: list.items.length });
    }

    // ---- İçerik çıkar ----
    if (action === "remove_item") {
      const { contentId } = body;

      list.items = list.items.filter(
        (it: any) => it.contentId.toString() !== contentId
      );

      await list.save();
      return NextResponse.json({ ok: true, itemCount: list.items.length });
    }

    return NextResponse.json({ error: "Geçersiz action" }, { status: 400 });
  } catch (err) {
    console.error("Liste güncelleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Liste sil. Sadece sahibi. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();

    const list = await List.findById(id);
    if (!list) {
      return NextResponse.json({ error: "Liste bulunamadı" }, { status: 404 });
    }

    if (list.userId.toString() !== auth.userId) {
      return NextResponse.json({ error: "Yetkin yok" }, { status: 403 });
    }

    await List.deleteOne({ _id: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Liste silme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}