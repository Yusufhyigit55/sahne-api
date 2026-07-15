import { Schema, model, models } from "mongoose";

const ListItemSchema = new Schema(
  {
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },
    order: { type: Number, default: 0 },
    note: { type: String, maxlength: 200, default: "" },
  },
  { _id: false }
);

const ListSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 300, default: "" },
    coverImage: { type: String, default: null },

    items: { type: [ListItemSchema], default: [] },

    isPublic: { type: Boolean, default: true },

    favoritedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    favoriteCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ListSchema.index({ userId: 1, createdAt: -1 });
ListSchema.index({ isPublic: 1, favoriteCount: -1 });

export const List = models.List || model("List", ListSchema);