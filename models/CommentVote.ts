import { Schema, model, models } from "mongoose";

const CommentVoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    commentId: { type: Schema.Types.ObjectId, ref: "Comment", required: true },

    // 1 = beğendi, -1 = beğenmedi
    value: { type: Number, enum: [1, -1], required: true },
  },
  { timestamps: true }
);

CommentVoteSchema.index({ userId: 1, commentId: 1 }, { unique: true });

export const CommentVote =
  models.CommentVote || model("CommentVote", CommentVoteSchema);