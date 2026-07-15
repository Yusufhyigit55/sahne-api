import { Schema, model, models } from "mongoose";

const PollOptionSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 100 },
    imageUrl: { type: String, default: null },
    voteCount: { type: Number, default: 0 },
  },
  { _id: true }
);

const PollSchema = new Schema(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    question: { type: String, required: true, maxlength: 200 },

    // Hangi içeriğe bağlı
    targetType: {
      type: String,
      enum: ["series", "movie", "book", "episode"],
      required: true,
    },
    contentId: { type: Schema.Types.ObjectId, ref: "Content", required: true },
    season: { type: Number, default: null },
    episode: { type: Number, default: null },

    type: {
      type: String,
      enum: ["single", "multiple", "yesno", "prediction"],
      default: "single",
    },

    options: { type: [PollOptionSchema], default: [] },

    isSpoiler: { type: Boolean, default: false },

    // Tahmin anketi: bölüm yayınlanınca kapanır
    closesAt: { type: Date, default: null },
    isClosed: { type: Boolean, default: false },

    totalVotes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PollSchema.index({ contentId: 1, season: 1, episode: 1 });

const PollVoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pollId: { type: Schema.Types.ObjectId, ref: "Poll", required: true },
    optionIds: [{ type: Schema.Types.ObjectId }],
  },
  { timestamps: true }
);

PollVoteSchema.index({ userId: 1, pollId: 1 }, { unique: true });

export const Poll = models.Poll || model("Poll", PollSchema);
export const PollVote = models.PollVote || model("PollVote", PollVoteSchema);