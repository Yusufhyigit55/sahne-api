import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { getAuthUser } from "@/lib/auth";

/** Ayarları getir */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(auth.userId)
      .select(
        "username displayName bio location avatar theme language isPrivate activityHidden statsPublic notifPrefs usernameChangedAt"
      )
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const u = user as any;

    // Kullanıcı adı ne zaman değiştirilebilir? (30 günde bir)
    let canChangeUsername = true;
    let usernameChangeDate: Date | null = null;

    if (u.usernameChangedAt) {
      const next = new Date(u.usernameChangedAt);
      next.setDate(next.getDate() + 30);
      canChangeUsername = new Date() >= next;
      usernameChangeDate = canChangeUsername ? null : next;
    }

    return NextResponse.json({
      ok: true,
      settings: {
        username: u.username,
        displayName: u.displayName,
        bio: u.bio ?? "",
        location: u.location ?? "",
        avatar: u.avatar,
        theme: u.theme,
        language: u.language,
        isPrivate: u.isPrivate,
        activityHidden: u.activityHidden,
        statsPublic: u.statsPublic,
        notifPrefs: u.notifPrefs,
        canChangeUsername,
        usernameChangeDate,
      },
    });
  } catch (err) {
    console.error("Ayar getirme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/** Ayarları güncelle */
export async function PATCH(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }

    const body = await req.json();
    await connectDB();

    const update: Record<string, any> = {};

    // Kullanıcı adı değişimi — 30 günde bir
    if (body.username != null) {
      const newUsername = String(body.username).toLowerCase().trim();

      if (!/^[a-z0-9._]{3,20}$/.test(newUsername)) {
        return NextResponse.json(
          {
            error:
              "Kullanıcı adı 3-20 karakter olmalı, sadece küçük harf, rakam, nokta ve alt çizgi içerebilir",
          },
          { status: 400 }
        );
      }

      const user = await User.findById(auth.userId).select(
        "username usernameChangedAt"
      );

      if (!user) {
        return NextResponse.json(
          { error: "Kullanıcı bulunamadı" },
          { status: 404 }
        );
      }

      if (newUsername !== user.username) {
        if (user.usernameChangedAt) {
          const next = new Date(user.usernameChangedAt);
          next.setDate(next.getDate() + 30);

          if (new Date() < next) {
            return NextResponse.json(
              {
                error: `Kullanıcı adını ${next.toLocaleDateString(
                  "tr-TR"
                )} tarihinden sonra değiştirebilirsin`,
              },
              { status: 400 }
            );
          }
        }

        const exists = await User.findOne({ username: newUsername });
        if (exists) {
          return NextResponse.json(
            { error: "Bu kullanıcı adı alınmış" },
            { status: 409 }
          );
        }

        update.username = newUsername;
        update.usernameChangedAt = new Date();
      }
    }

    // Profil alanları
    if (body.displayName != null) {
      const dn = String(body.displayName).trim();
      if (!dn || dn.length > 50) {
        return NextResponse.json(
          { error: "Görünen isim 1-50 karakter olmalı" },
          { status: 400 }
        );
      }
      update.displayName = dn;
    }

    if (body.bio != null) {
      if (String(body.bio).length > 200) {
        return NextResponse.json(
          { error: "Biyografi en fazla 200 karakter olabilir" },
          { status: 400 }
        );
      }
      update.bio = String(body.bio);
    }

    if (body.location != null) update.location = String(body.location);
    if (body.avatar != null) update.avatar = body.avatar;

    if (body.theme != null) {
      if (!["dark", "beige"].includes(body.theme)) {
        return NextResponse.json({ error: "Geçersiz tema" }, { status: 400 });
      }
      update.theme = body.theme;
    }

    if (body.language != null) {
      if (!["tr", "en"].includes(body.language)) {
        return NextResponse.json({ error: "Geçersiz dil" }, { status: 400 });
      }
      update.language = body.language;
    }

    // Gizlilik
    if (body.isPrivate != null) update.isPrivate = !!body.isPrivate;
    if (body.activityHidden != null)
      update.activityHidden = !!body.activityHidden;
    if (body.statsPublic != null) update.statsPublic = !!body.statsPublic;

    // Bildirim tercihleri
    if (body.notifPrefs != null) {
      const np = body.notifPrefs;
      if (np.push != null) update["notifPrefs.push"] = !!np.push;
      if (np.email != null) update["notifPrefs.email"] = !!np.email;
      if (np.newEpisode != null)
        update["notifPrefs.newEpisode"] = !!np.newEpisode;
      if (np.follows != null) update["notifPrefs.follows"] = !!np.follows;
      if (np.commentReplies != null)
        update["notifPrefs.commentReplies"] = !!np.commentReplies;
      if (np.likes != null) update["notifPrefs.likes"] = !!np.likes;
      if (np.friendActivity != null)
        update["notifPrefs.friendActivity"] = !!np.friendActivity;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Değişiklik yok" });
    }

    await User.findByIdAndUpdate(auth.userId, { $set: update });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Ayar güncelleme hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}