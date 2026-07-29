export const metadata = {
  title: "Hesap Silme — Tracks",
  description: "Tracks hesabınızı ve verilerinizi nasıl sileceğiniz",
};

const box: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "40px 24px 80px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#1a1a1a",
  lineHeight: 1.7,
  fontSize: 16,
};

export default function DeleteAccountPage() {
  return (
    <main style={box}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
        Hesap ve Veri Silme
      </h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Son güncelleme: 30 Temmuz 2026
      </p>

      <p>
        Bu sayfa, Tracks (&quot;Uygulama&quot;) hesabınızı ve ilişkili
        verilerinizi nasıl silebileceğinizi açıklar. Hesabınızı istediğiniz
        zaman silebilirsiniz.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        1. Uygulama İçinden Silme
      </h2>
      <p>
        Hesabınızı doğrudan uygulama içinden silebilirsiniz:
      </p>
      <ol>
        <li>Tracks uygulamasını açın ve hesabınıza giriş yapın.</li>
        <li>
          <strong>Ayarlar</strong> ekranına gidin.
        </li>
        <li>
          <strong>Hesabı Sil</strong> seçeneğine dokunun.
        </li>
        <li>
          Onay adımını tamamlayın. Hesabınız ve verileriniz kalıcı olarak
          silinir.
        </li>
      </ol>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        2. E-posta ile Silme Talebi
      </h2>
      <p>
        Uygulamaya erişiminiz yoksa, hesabınızın silinmesini e-posta ile
        talep edebilirsiniz. Hesabınıza kayıtlı e-posta adresinden{" "}
        <strong>ipeksahan2@gmail.com</strong> adresine{" "}
        &quot;Hesap Silme Talebi&quot; konulu bir e-posta gönderin. Talebiniz
        en geç 30 gün içinde işleme alınır.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        3. Silinen Veriler
      </h2>
      <p>
        Hesabınızı sildiğinizde aşağıdaki veriler kalıcı olarak silinir:
      </p>
      <ul>
        <li>Hesap bilgileri (e-posta adresi, kullanıcı adı, profil bilgileri)</li>
        <li>İzleme, okuma ve puanlama kayıtları</li>
        <li>Oluşturduğunuz listeler</li>
        <li>Yorumlar, değerlendirmeler ve anket oyları</li>
        <li>Takip ilişkileri ve sosyal etkileşimler</li>
        <li>Bildirimler ve uygulama içi etkinlik geçmişi</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        4. Saklanan Veriler ve Süre
      </h2>
      <p>
        Hesap silme işlemi geri alınamaz ve verileriniz derhal silinir.
        Yasal yükümlülükler (ör. mali veya güvenlik kayıtları) gerektirmedikçe
        hiçbir kişisel veriniz saklanmaz. Böyle bir zorunluluk olması
        durumunda, ilgili veriler yalnızca yasanın gerektirdiği süre boyunca
        saklanır ve bu sürenin sonunda silinir.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        5. İletişim
      </h2>
      <p>
        Hesap silme ile ilgili sorularınız için{" "}
        <strong>ipeksahan2@gmail.com</strong> adresinden bize ulaşabilirsiniz.
      </p>
    </main>
  );
}