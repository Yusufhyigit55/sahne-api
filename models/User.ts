import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    /** Giriş bilgileri */
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    password: { type: String, default: null, select: false },
    /** Sosyal giriş kimlikleri */
    appleId: { type: String, default: null, index: true, sparse: true },
    googleId: { type: String, default: null, index: true, sparse: true },
    /** Giriş yöntemi: local, apple, google */
    authProvider: {
      type: String,
      enum: ["local", "apple", "google"],
      default: "local",
    },

    /** Profil */
    displayName: { type: String, required: true, maxlength: 50 },
    bio: { type: String, maxlength: 200, default: "" },
    location: { type: String, default: "" },
    avatar: { type: String, default: null },
    birthDate: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["male", "female", "unspecified"],
      default: null,
    },

    /** Rol */
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
    },

    /** Tercihler */
    theme: {
      type: String,
      enum: ["dark", "beige"],
      default: "dark",
    },
    language: {
      type: String,
      enum: ["tr", "en"],
      default: "tr",
    },

    /** Gizlilik */
    isPrivate: { type: Boolean, default: false },
    activityHidden: { type: Boolean, default: false },
    statsPublic: { type: Boolean, default: true },

    /** Bildirim tercihleri */
    notifPrefs: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      newEpisode: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      commentReplies: { type: Boolean, default: true },
      likes: { type: Boolean, default: true },
      friendActivity: { type: Boolean, default: true },
    },

    /** İstatistikler — denormalize */
    stats: {
      episodesWatched: { type: Number, default: 0 },
      moviesWatched: { type: Number, default: 0 },
      booksRead: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      followers: { type: Number, default: 0 },
      following: { type: Number, default: 0 },
    },

    /** Streak */
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastWatchDate: { type: Date, default: null },

    /** Favoriler — profilde vitrin */
    favoriteContents: [{ type: Schema.Types.ObjectId, ref: "Content" }],

    /** Push token */
    pushToken: { type: String, default: null },

    /** Kullanıcı adı 30 günde bir değiştirilebilir */
    usernameChangedAt: { type: Date, default: null },

    /** E-posta doğrulama */
    emailVerified: { type: Boolean, default: false },
    /** Onboarding tamamlandı mı */
    /** E-posta doğrulama kodu */
    verificationCode: { type: String, default: null, select: false },
    verificationCodeExpires: { type: Date, default: null, select: false },

    /** Şifre sıfırlama kodu */
    resetCode: { type: String, default: null, select: false },
    resetCodeExpires: { type: Date, default: null, select: false },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });

export const User = models.User ?? model("User", UserSchema);