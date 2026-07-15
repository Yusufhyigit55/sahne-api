import { Schema, model, models } from "mongoose";

export const REPORT_REASONS = [
  "unmarked_spoiler",   // İşaretlenmemiş spoiler
  "harassment",         // Hakaret / küfür
  "spam",               // Spam / reklam
  "inappropriate",      // Uygunsuz içerik
  "targeting",          // Taciz / hedef gösterme
] as const;

const ReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    targetType: {
      type: String,
      enum: ["comment", "user", "list", "poll"],
      required: true,
    },
    commentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    listId: { type: Schema.Types.ObjectId, ref: "List", default: null },
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", default: null },

    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, maxlength: 500, default: "" },

    status: {
      type: String,
      enum: ["pending", "resolved", "rejected"],
      default: "pending",
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Aynı kullanıcı aynı yorumu bir kez bildirebilir
ReportSchema.index(
  { reporterId: 1, commentId: 1 },
  { unique: true, sparse: true }
);
ReportSchema.index({ status: 1, createdAt: -1 });

export const Report = models.Report || model("Report", ReportSchema);