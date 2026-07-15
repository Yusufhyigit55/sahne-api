import { Schema, model, models } from "mongoose";

export type CommentTarget = "series" | "movie" | "book" | "episode";

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Hangi içeriğe yorum
    targetType: {
      type: String,
      enum: ["series", "movie", "book", "episode"],
      required: true,
    },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    // targetType === "episode" ise doldurulur
    season: { type: Number, default: null },
    episode: { type: Number, default: null },

    // İçerik
    body: { type: String, maxlength: 2000, default: "" },
    gifUrl: { type: String, default: null },

    // Spoiler sistemi
    isSpoiler: { type: Boolean, default: false },
    spoilerFlaggedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    spoilerConfirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    spoilerPending: { type: Boolean, default: false },

    // Yorumu yazan içeriği izlemiş mi? (denormalize)
    hasWatched: { type: Boolean, default: false },

    // Yanıt sistemi — iki seviye
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    mentionedUser: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // Etkileşim sayaçları (denormalize)
    likeCount: { type: Number, default: 0 },
    dislikeCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },

    // Silme — kayıt kalır, metin gider
    isDeleted: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommentSchema.index({ contentId: 1, targetType: 1, season: 1, episode: 1, parentId: 1 });
CommentSchema.index({ userId: 1, createdAt: -1 });

export const Comment = models.Comment || model("Comment", CommentSchema);