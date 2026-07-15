import { Schema, model, models } from "mongoose";

const BlockSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // block = karşılıklı görünmezlik
    // mute  = tek taraflı, karşı taraf bilmez
    type: {
      type: String,
      enum: ["block", "mute"],
      required: true,
    },
  },
  { timestamps: true }
);

BlockSchema.index({ userId: 1, targetUserId: 1, type: 1 }, { unique: true });
BlockSchema.index({ userId: 1, type: 1 });

export const Block = models.Block || model("Block", BlockSchema);