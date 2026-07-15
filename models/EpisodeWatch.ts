import { Schema, model, models } from "mongoose";

const EpisodeWatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    season: { type: Number, required: true },
    episode: { type: Number, required: true },

    watchedAt: { type: Date, default: Date.now },
    isApproximateDate: { type: Boolean, default: false },
    rewatchCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Aynı bölüm iki kez işaretlenemez
EpisodeWatchSchema.index(
  { userId: 1, contentId: 1, season: 1, episode: 1 },
  { unique: true }
);
EpisodeWatchSchema.index({ userId: 1, contentId: 1 });

export const EpisodeWatch =
  models.EpisodeWatch || model("EpisodeWatch", EpisodeWatchSchema);