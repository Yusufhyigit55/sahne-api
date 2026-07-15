import { Schema, model, models } from "mongoose";

export const ACTIVITY_TYPES = [
  "started_series",     // Diziye başladı
  "completed_series",   // Diziyi tamamladı
  "watched_movie",      // Film izledi
  "finished_book",      // Kitap bitirdi
  "rated",              // Puan verdi
  "reviewed",           // İnceleme yazdı
  "episode_batch",      // Toplu bölüm izledi (gürültüyü azaltmak için)
  "reviewed_episode",   // Bölüm değerlendirdi
  "voted_character",    // Favori karakter seçti
  "created_poll",       // Anket oluşturdu
  "commented",          // Yorum yazdı
] as const;

const ActivitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: ACTIVITY_TYPES, required: true },

    contentId: { type: Schema.Types.ObjectId, ref: "Content", default: null },
    season: { type: Number, default: null },
    episode: { type: Number, default: null },

    // Ek bilgi (puan, tepki sayısı, kaç bölüm izlendi vs.)
    meta: { type: Schema.Types.Mixed, default: {} },

    // Gizli izleme modunda true — feed'e düşmez
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Feed sorgusu: takip edilenlerin gizli olmayan aktiviteleri, kronolojik
ActivitySchema.index({ userId: 1, isHidden: 1, createdAt: -1 });
ActivitySchema.index({ createdAt: -1 });

export const Activity = models.Activity || model("Activity", ActivitySchema);