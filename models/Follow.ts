import { Schema, model, models } from "mongoose";

const FollowSchema = new Schema(
  {
    followerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    followingId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Gizli hesapta "pending", açık hesapta doğrudan "accepted"
    status: {
      type: String,
      enum: ["pending", "accepted"],
      default: "accepted",
    },
  },
  { timestamps: true }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1, status: 1 });

export const Follow = models.Follow || model("Follow", FollowSchema);