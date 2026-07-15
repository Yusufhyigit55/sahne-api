import { Schema, model, models } from "mongoose";

export type WatchStatus =
  | "watchlist"    // İzleme listesinde
  | "watching"     // İzliyor
  | "up_to_date"   // Güncel
  | "completed"    // Tamamlandı
  | "paused"       // Askıya alındı
  | "dropped"      // Yarım bırakıldı
  | "reading";     // Okuyor (kitap)

const WatchRecordSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    status: {
      type: String,
      enum: [
        "none",        // Sadece beğeni/favori var, izleme durumu yok
        "watchlist",
        "watching",
        "up_to_date",
        "completed",
        "paused",
        "dropped",
        "reading",
      ],
      default: "none",
    },

    // Kullanıcı durumu elle seçtiyse otomatik hesaplama ezilmez
    manualOverride: { type: Boolean, default: false },

    // Değerlendirme
    rating: { type: Number, min: 1, max: 10, default: null },
    isLiked: { type: Boolean, default: false },
    isDisliked: { type: Boolean, default: false },
    isFavorite: { type: Boolean, default: false },

    // Gizli izleme — istatistiğe dahil, profilde ve feed'de görünmez
    isHidden: { type: Boolean, default: false },

    // Tarihler
    watchedAt: { type: Date, default: null },
    isApproximateDate: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },

    // Yarım bırakılan film — kaldığı dakika
    stoppedAtMinute: { type: Number, default: null },

    // Tekrar izleme
    rewatchCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Bir kullanıcı bir içerik için tek kayıt tutar
WatchRecordSchema.index({ userId: 1, contentId: 1 }, { unique: true });
WatchRecordSchema.index({ userId: 1, status: 1 });

export const WatchRecord =
  models.WatchRecord || model("WatchRecord", WatchRecordSchema);