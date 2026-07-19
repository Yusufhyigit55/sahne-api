/**
 * Expo Push API üzerinden bir cihaza push bildirimi gönderir.
 * Token yoksa ya da geçersizse sessiz geçer.
 */
export async function sendPush(args: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<void> {
  try {
    // Expo push token formatı kontrolü
    if (!args.token || !args.token.startsWith("ExponentPushToken")) {
      return;
    }

    const message = {
      to: args.token,
      title: args.title,
      body: args.body,
      sound: "default",
      data: args.data ?? {},
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      console.error("Expo push gönderme başarısız:", res.status);
    }
  } catch (err) {
    console.error("Push gönderme hatası:", err);
    // Sessiz geç — push başarısız olsa ana akış bozulmasın
  }
}