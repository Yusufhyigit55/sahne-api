import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalı")
    .max(72, "Şifre çok uzun"),
  username: z
    .string()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı")
    .max(20, "Kullanıcı adı en fazla 20 karakter olabilir")
    .regex(
      /^[a-z0-9._]+$/,
      "Kullanıcı adı yalnızca küçük harf, rakam, nokta ve alt çizgi içerebilir"
    ),
  displayName: z
    .string()
    .min(1, "Görünen isim gerekli")
    .max(50, "Görünen isim çok uzun"),
  birthDate: z.string().min(1, "Doğum tarihi gerekli"),
  gender: z.enum(["male", "female", "unspecified"]).optional(),
  acceptedTerms: z.literal(true, {
    message: "Kullanım koşullarını kabul etmelisiniz",
  }),
  acceptedPrivacy: z.literal(true, {
    message: "Gizlilik politikasını kabul etmelisiniz",
  }),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "E-posta veya kullanıcı adı gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;