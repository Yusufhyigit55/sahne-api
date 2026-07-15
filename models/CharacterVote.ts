import { Schema, model, models } from "mongoose";

export type VoteScope = "episode" | "series" | "movie";

const CharacterVoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    scope: {
      type: String,
      enum: ["episode", "series", "movie"],
      required: true,
    },

    // scope === "episode" ise doldurulur
    season: { type: Number, default: null },
    episode: { type: Number, default: null },

    // TMDB oyuncu id'si
    characterId: { type: Number, required: true },
    characterName: { type: String, default: "" },
    actorName: { type: String, default: "" },
  },
  { timestamps: true }
);

// Her bağlamda tek oy
CharacterVoteSchema.index(
  { userId: 1, contentId: 1, scope: 1, season: 1, episode: 1 },
  { unique: true }
);
CharacterVoteSchema.index({ contentId: 1, scope: 1, characterId: 1 });

export const CharacterVote =
  models.CharacterVote || model("CharacterVote", CharacterVoteSchema);