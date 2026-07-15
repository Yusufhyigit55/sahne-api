import { Schema, model, models } from "mongoose";

/** İhlal sayısına göre ceza süresi (gün). null = kalıcı */
export const BAN_LADDER: (number | null)[] = [5, 15, 30, 90, null];

export function getBanDuration(banCount: number): number | null {
  const idx = Math.min(banCount - 1, BAN_LADDER.length - 1);
  return BAN_LADDER[idx];
}

const BanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    reason: {
      type: String,
      enum: ["unmarked_spoiler", "harassment", "spam", "inappropriate", "targeting"],
      required: true,
    },

    // Kaçıncı ihlal
    banCount: { type: Number, required: true },
    durationDays: { type: Number, default: null },

    // null = kalıcı
    expiresAt: { type: Date, default: null },

    moderatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, maxlength: 500, default: "" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

BanSchema.index({ userId: 1, isActive: 1 });

export const Ban = models.Ban || model("Ban", BanSchema);