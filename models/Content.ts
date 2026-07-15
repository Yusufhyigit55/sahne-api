import { Schema, model, models } from "mongoose";

export type ContentType = "series" | "movie" | "book";

const ContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["series", "movie", "book"],
      required: true,
    },

    // Dış kaynak kimlikleri
    tmdbId: { type: Number, default: null },
    googleBooksId: { type: String, default: null },

    // Temel bilgi (arama için yerelde tutulur)
    titleTr: { type: String, required: true },
    titleOriginal: { type: String, default: "" },
    posterPath: { type: String, default: null },
    year: { type: Number, default: null },
    genres: { type: [String], default: [] },
    // Denormalize sayaçlar
    addedByCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    dislikeCount: { type: Number, default: 0 },

    // Dizi/film özel
    totalEpisodes: { type: Number, default: 0 },
    totalSeasons: { type: Number, default: 0 },
    isEnded: { type: Boolean, default: false },
    runtime: { type: Number, default: 0 },

    // Kitap özel
    pageCount: { type: Number, default: 0 },

    // Kişisel içerik (kullanıcı kendi ekledi, genel aramada çıkmaz)
    isPersonal: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    mergedInto: { type: Schema.Types.ObjectId, ref: "Content", default: null },
  },
  { timestamps: true }
);

// Aynı içerik iki kez eklenmesin
ContentSchema.index(
  { type: 1, tmdbId: 1 },
  { unique: true, partialFilterExpression: { tmdbId: { $type: "number" } } }
);
ContentSchema.index(
  { type: 1, googleBooksId: 1 },
  { unique: true, partialFilterExpression: { googleBooksId: { $type: "string" } } }
);
ContentSchema.index({ titleTr: "text", titleOriginal: "text" });

// Uygulama içi ortalama puan
ContentSchema.virtual("appRating").get(function () {
  if (this.ratingCount === 0) return null;
  return (this.ratingSum / this.ratingCount).toFixed(1);
});

export const Content = models.Content || model("Content", ContentSchema);