import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Domain doğrulanana kadar test adresi. Doğrulanınca: "Tracks <noreply@gettracks.app>"
const FROM = process.env.MAIL_FROM ?? "Tracks <onboarding@resend.dev>";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

export async function sendMail({ to, subject, html }: SendArgs): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Mail gönderme hatası:", error);
    throw new Error("Mail gönderilemedi");
  }
}

/** Doğrulama kodu maili */
export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  await sendMail({
    to,
    subject: "Tracks - E-posta Doğrulama Kodu",
    html: verificationTemplate(code),
  });
}

/** Şifre sıfırlama kodu maili */
export async function sendResetEmail(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: "Tracks - Şifre Sıfırlama Kodu",
    html: resetTemplate(code),
  });
}

function verificationTemplate(code: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0f0f;color:#fff;border-radius:16px">
    <h1 style="font-size:22px;margin:0 0 8px">Tracks'e hoş geldin</h1>
    <p style="color:#aaa;font-size:15px;margin:0 0 24px">Hesabını doğrulamak için aşağıdaki kodu gir:</p>
    <div style="background:#1a1a1a;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <span style="font-size:34px;font-weight:700;letter-spacing:8px;color:#fff">${code}</span>
    </div>
    <p style="color:#666;font-size:13px;margin:0">Kod 10 dakika geçerlidir. Bu isteği sen yapmadıysan bu maili yok say.</p>
  </div>`;
}

function resetTemplate(code: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f0f0f;color:#fff;border-radius:16px">
    <h1 style="font-size:22px;margin:0 0 8px">Şifre Sıfırlama</h1>
    <p style="color:#aaa;font-size:15px;margin:0 0 24px">Şifreni sıfırlamak için aşağıdaki kodu gir:</p>
    <div style="background:#1a1a1a;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
      <span style="font-size:34px;font-weight:700;letter-spacing:8px;color:#fff">${code}</span>
    </div>
    <p style="color:#666;font-size:13px;margin:0">Kod 10 dakika geçerlidir. Bu isteği sen yapmadıysan şifren güvende, bu maili yok say.</p>
  </div>`;
}