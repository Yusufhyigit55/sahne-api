import { User, Notification, Follow } from "@/models";
import { sendPush } from "@/lib/push-send";

type NotifType =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "comment_reply"
  | "comment_like"
  | "new_episode"
  | "friend_watched"
  | "friend_commented"
  | "poll_result"
  | "ban"
  | "spoiler_flagged";

// Hangi bildirim tipi hangi notifPrefs ayarına bağlı
const PREF_MAP: Record<string, string> = {
  follow: "follows",
  follow_request: "follows",
  follow_accepted: "follows",
  comment_reply: "commentReplies",
  comment_like: "likes",
  new_episode: "newEpisode",
  friend_watched: "friendActivity",
  friend_commented: "friendActivity",
  // poll_result, ban, spoiler_flagged → ayar yok, her zaman gider
};

type NotifyArgs = {
  userId: string; // bildirim alan
  type: NotifType;
  actorId?: string | null; // eylemi yapan
  contentId?: string | null;
  commentId?: string | null;
  season?: number | null;
  episode?: number | null;
  message?: string;
};

/**
 * Bildirim oluşturur — ama önce:
 * 1) Kendine bildirim gönderme (actor === recipient) → atla
 * 2) Alıcı bu bildirim türünü kapatmışsa → atla
 * Hata olsa bile ana akışı bozmaz (try-catch).
 */
export async function notify(args: NotifyArgs): Promise<void> {
  try {
    const { userId, type, actorId } = args;

    // Kendine bildirim gitmesin
    if (actorId && String(actorId) === String(userId)) return;

    // Ayar kontrolü
    const prefKey = PREF_MAP[type];
    if (prefKey) {
      const recipient = await User.findById(userId).select("notifPrefs");
      if (recipient?.notifPrefs && recipient.notifPrefs[prefKey] === false) {
        return; // kullanıcı bu bildirimi kapatmış
      }
    }

    await Notification.create({
      userId,
      type,
      actorId: actorId ?? null,
      contentId: args.contentId ?? null,
      commentId: args.commentId ?? null,
      season: args.season ?? null,
      episode: args.episode ?? null,
      message: args.message ?? "",
    });

    // Push bildirimi gönder (token varsa + push açıksa)
    const recipientForPush = await User.findById(userId).select(
      "pushToken notifPrefs displayName"
    );
    if (
      recipientForPush?.pushToken &&
      recipientForPush.notifPrefs?.push !== false
    ) {
      // Eylemi yapan kişinin adı (varsa)
      let actorName = "";
      if (actorId) {
        const actor = await User.findById(actorId).select(
          "displayName username"
        );
        actorName = actor?.displayName || actor?.username || "Biri";
      }
      const { title, body } = pushText(type, actorName, args.message ?? "");
      await sendPush({
        token: recipientForPush.pushToken,
        title,
        body,
        data: { type, contentId: args.contentId ?? null },
      });
    }
  } catch (err) {
    console.error("Bildirim oluşturma hatası:", err);
    // Bildirim hatası ana işlemi bozmasın
  }
}

/**
 * Bir kullanıcının kabul edilmiş takipçilerine toplu bildirim gönderir.
 * Arkadaş aktivitesi için (dizi/film/kitap bitirdi).
 * Her takipçinin friendActivity ayarı notify() içinde kontrol edilir.
 */
export async function notifyFollowers(args: {
  actorId: string; // eylemi yapan (bitiren kişi)
  type: "friend_watched" | "friend_commented";
  contentId?: string | null;
  message?: string;
}): Promise<void> {
  try {
    const followers = await Follow.find({
      followingId: args.actorId,
      status: "accepted",
    })
      .select("followerId")
      .lean();

    // Her takipçiye sırayla bildirim (notify ayar kontrolü yapar)
    await Promise.all(
      followers.map((f: any) =>
        notify({
          userId: f.followerId.toString(),
          type: args.type,
          actorId: args.actorId,
          contentId: args.contentId ?? null,
          message: args.message ?? "",
        })
      )
    );
  } catch (err) {
    console.error("Takipçi bildirimi hatası:", err);
  }
}

/** Bildirim tipine göre push başlık + metni üretir */
function pushText(
  type: string,
  actorName: string,
  message: string
): { title: string; body: string } {
  switch (type) {
    case "follow":
      return { title: "Yeni takipçi", body: `${actorName} seni takip etti` };
    case "follow_request":
      return {
        title: "Takip isteği",
        body: `${actorName} takip etmek istiyor`,
      };
    case "follow_accepted":
      return {
        title: "Takip kabul edildi",
        body: `${actorName} takip isteğini kabul etti`,
      };
    case "comment_like":
      return { title: "Beğeni", body: `${actorName} yorumunu beğendi` };
    case "comment_reply":
      return { title: "Yeni yanıt", body: `${actorName} yorumuna yanıt verdi` };
    case "friend_watched":
      return {
        title: "Arkadaş aktivitesi",
        body: message
          ? `${actorName}, "${message}" içeriğini bitirdi`
          : `${actorName} bir içerik bitirdi`,
      };
    case "friend_commented":
      return {
        title: "Arkadaş aktivitesi",
        body: `${actorName} yorum yaptı`,
      };
    case "new_episode":
      return {
        title: "Yeni bölüm",
        body: message || "Takip ettiğin dizinin yeni bölümü çıktı",
      };
    default:
      return { title: "Tracks", body: message || "Yeni bir bildirimin var" };
  }
}