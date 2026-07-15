import { Schema, model, models } from "mongoose";

export const REACTIONS = [
  "laughed",      // Güldüm
  "cried",        // Ağladım
  "shocked",      // Şok oldum
  "angry",        // Sinirlendim
  "scared",       // Korktum
  "tense",        // Gerildim
  "confused",     // Kafam karıştı
  "bored",        // Sıkıldım
  "excited",      // Heyecanlandım
  "moved",        // Duygulandım
] as const;

const EpisodeReviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    season: { type: Number, required: true },
    episode: { type: Number, required: true },

    // 5 kademeli: 1=Çok kötü ... 5=Çok iyi
    score: { type: Number, min: 1, max: 5, default: null },

    // En fazla 5 tepki
    reactions: {
      type: [String],
      enum: REACTIONS,
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 5,
        message: "En fazla 5 tepki seçilebilir",
      },
    },

    // TMDB karakter/oyuncu id'si
    favoriteCharacterId: { type: Number, default: null },
  },
  { timestamps: true }
);

EpisodeReviewSchema.index(
  { userId: 1, contentId: 1, season: 1, episode: 1 },
  { unique: true }
);
EpisodeReviewSchema.index({ contentId: 1, season: 1, episode: 1 });

export const EpisodeReview =
  models.EpisodeReview || model("EpisodeReview", EpisodeReviewSchema);