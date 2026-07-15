export const metadata = {
  title: "Gizlilik Politikası — StoryKind",
  description: "StoryKind gizlilik politikası",
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

export default function PrivacyPage() {
  return (
    <main style={box}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
        Gizlilik Politikası
      </h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Son güncelleme: 15 Temmuz 2026
      </p>

      <p>
        StoryKind (&quot;Uygulama&quot;, &quot;biz&quot;) olarak
        gizliliğinize önem veriyoruz. Bu politika, StoryKind mobil
        uygulamasını kullandığınızda hangi verileri topladığımızı, nasıl
        kullandığımızı ve haklarınızı açıklar.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        1. Topladığımız Veriler
      </h2>
      <p>Hesap oluşturduğunuzda ve uygulamayı kullandığınızda:</p>
      <ul>
        <li>
          <strong>Hesap bilgileri:</strong> e-posta adresi, kullanıcı adı,
          görünen isim ve şifreniz (şifreniz şifrelenmiş / hash&apos;lenmiş
          olarak saklanır, düz metin olarak tutulmaz).
        </li>
        <li>
          <strong>Profil bilgileri:</strong> doğum tarihi, isteğe bağlı
          cinsiyet bilgisi, biyografi ve profil fotoğrafı (avatar).
        </li>
        <li>
          <strong>Kullanım verileri:</strong> izlediğiniz/okuduğunuz dizi,
          film ve kitaplar; verdiğiniz puanlar, yorumlar, listeler; takip
          ettiğiniz kullanıcılar ve etkileşimleriniz.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        2. Verileri Nasıl Kullanıyoruz
      </h2>
      <ul>
        <li>Hesabınızı oluşturmak ve yönetmek,</li>
        <li>İzleme takibinizi ve istatistiklerinizi sunmak,</li>
        <li>Size kişiselleştirilmiş içerik önerileri göstermek,</li>
        <li>
          Sosyal özellikleri (takip, yorum, birlikte izleme önerileri)
          çalıştırmak,
        </li>
        <li>Uygulamanın güvenliğini ve düzgün çalışmasını sağlamak.</li>
      </ul>
      <p>
        Verilerinizi reklam amacıyla üçüncü taraflara satmayız.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        3. Üçüncü Taraf Servisler
      </h2>
      <p>
        Uygulama, içerik ve işlevsellik sağlamak için şu üçüncü taraf
        servisleri kullanır:
      </p>
      <ul>
        <li>
          <strong>TMDB (The Movie Database):</strong> dizi ve film bilgileri.
        </li>
        <li>
          <strong>Google Books:</strong> kitap bilgileri.
        </li>
        <li>
          <strong>Cloudinary:</strong> profil fotoğraflarının depolanması.
        </li>
        <li>
          <strong>Giphy:</strong> GIF içerikleri.
        </li>
      </ul>
      <p>
        Bu servislerin kendi gizlilik politikaları geçerlidir. Profil
        fotoğrafınız dışında kişisel verileriniz bu servislere aktarılmaz.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        4. Veri Saklama ve Güvenlik
      </h2>
      <p>
        Verileriniz güvenli sunucularda saklanır ve şifreli bağlantılar
        (HTTPS) üzerinden iletilir. Şifreniz geri döndürülemez şekilde
        şifrelenir. Verilerinizi yalnızca hizmeti sunmak için gerekli
        olduğu sürece saklarız.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        5. Haklarınız
      </h2>
      <ul>
        <li>
          <strong>Erişim ve düzeltme:</strong> Profil bilgilerinizi uygulama
          içinden görüntüleyebilir ve değiştirebilirsiniz.
        </li>
        <li>
          <strong>Silme:</strong> Ayarlar &gt; Hesabı Sil bölümünden
          hesabınızı ve tüm verilerinizi kalıcı olarak silebilirsiniz. Bu
          işlem geri alınamaz.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        6. Çocukların Gizliliği
      </h2>
      <p>
        StoryKind 13 yaşından küçük kullanıcılara yönelik değildir. Kayıt
        sırasında doğum tarihi doğrulaması yapılır ve 13 yaşından küçük
        olduğu tespit edilen kullanıcıların kaydına izin verilmez.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        7. Değişiklikler
      </h2>
      <p>
        Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikleri
        uygulama üzerinden veya bu sayfada duyururuz.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        8. İletişim
      </h2>
      <p>
        Gizlilikle ilgili sorularınız için bize ulaşabilirsiniz:
        <br />
        <a href="mailto:yusufhyigit55@gmail.com">yusufhyigit55@gmail.com</a>
      </p>
    </main>
  );
}