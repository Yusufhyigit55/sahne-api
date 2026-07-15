import { Schema, model, models } from "mongoose";

export const NOTIF_TYPES = [
  "follow",             // Seni takip etti
  "follow_request",     // Takip isteği gönderdi
  "follow_accepted",    // Takip isteğini kabul etti
  "comment_reply",      // Yorumuna yanıt verdi
  "comment_like",       // Yorumunu beğendi
  "new_episode",        // Takip ettiğin dizinin yeni bölümü çıktı
  "friend_watched",     // Arkadaşın bir şey izledi
  "friend_commented",   // Arkadaşın yorum yazdı
  "poll_result",        // Oy verdiğin anket kapandı
  "ban",                // Ceza aldın
  "spoiler_flagged",    // Yorumun spoiler olarak işaretlendi
] as const;

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: NOTIF_TYPES, required: true },

    // Eylemi yapan kişi
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // İlgili içerik
    contentId: { type: Schema.Types.ObjectId, ref: "Content", default: null },
    commentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    season: { type: Number, default: null },
    episode: { type: Number, default: null },

    message: { type: String, default: "" },

    isRead: { type: Boolean, default: false },
    pushSent: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification =
  models.Notification || model("Notification", NotificationSchema);