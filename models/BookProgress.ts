import { Schema, model, models } from "mongoose";

const BookProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },

    currentPage: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    percent: { type: Number, min: 0, max: 100, default: 0 },

    // Kullanıcı hangi birimle takip ediyor
    trackBy: { type: String, enum: ["page", "percent"], default: "page" },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BookProgressSchema.index({ userId: 1, contentId: 1 }, { unique: true });

export const BookProgress =
  models.BookProgress || model("BookProgress", BookProgressSchema);