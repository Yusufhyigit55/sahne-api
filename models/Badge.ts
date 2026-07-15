import { Schema, model, models } from "mongoose";

export const BADGES = [
  "first_movie",        // İlk filmini kaydetti
  "first_series",       // İlk dizisini tamamladı
  "first_book",         // İlk kitabını bitirdi
  "first_comment",      // İlk yorumunu yazdı
  "first_poll",         // İlk anketini oluşturdu
  "100_episodes",       // 100 bölüm izledi
  "500_episodes",       // 500 bölüm izledi
  "1000_episodes",      // 1000 bölüm izledi
  "5_genres",           // 5 farklı tür izledi
  "season_complete",    // Bir sezonu tamamladı
  "up_to_date",         // Bir diziyi güncele getirdi
  "popular_comment",    // Toplulukta beğenilen yorum yazdı
] as const;

const BadgeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    badgeKey: { type: String, enum: BADGES, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

BadgeSchema.index({ userId: 1, badgeKey: 1 }, { unique: true });

/** Kullanıcının "bir daha gösterme" dediği öneriler */
const DismissedRecSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },
  },
  { timestamps: true }
);

DismissedRecSchema.index({ userId: 1, contentId: 1 }, { unique: true });

export const Badge = models.Badge || model("Badge", BadgeSchema);
export const DismissedRec =
  models.DismissedRec || model("DismissedRec", DismissedRecSchema);