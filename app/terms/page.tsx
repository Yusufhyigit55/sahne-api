export const metadata = {
  title: "Kullanım Koşulları — StoryKind",
  description: "StoryKind kullanım koşulları",
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

export default function TermsPage() {
  return (
    <main style={box}>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
        Kullanım Koşulları
      </h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Son güncelleme: 15 Temmuz 2026
      </p>

      <p>
        StoryKind uygulamasını kullanarak aşağıdaki koşulları kabul etmiş
        olursunuz. Lütfen dikkatlice okuyun.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        1. Hizmetin Tanımı
      </h2>
      <p>
        StoryKind; dizi, film ve kitap takibi yapmanızı, puan ve yorum
        eklemenizi, listeler oluşturmanızı ve diğer kullanıcılarla
        etkileşim kurmanızı sağlayan bir uygulamadır.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        2. Hesap Sorumluluğu
      </h2>
      <ul>
        <li>
          Hesabınızın güvenliğinden ve şifrenizin gizliliğinden siz
          sorumlusunuz.
        </li>
        <li>Doğru ve güncel bilgiler vermeyi kabul edersiniz.</li>
        <li>
          Hesabınızı kullanmak için en az 13 yaşında olmanız gerekir.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        3. Kullanıcı İçeriği ve Davranış Kuralları
      </h2>
      <p>Uygulamada yorum ve içerik paylaşırken şunları yapmamayı kabul edersiniz:</p>
      <ul>
        <li>Hakaret, taciz, nefret söylemi veya tehdit içeren içerik paylaşmak,</li>
        <li>Yasa dışı, müstehcen veya zararlı içerik yayınlamak,</li>
        <li>Başkalarının haklarını ihlal etmek veya spam yapmak,</li>
        <li>
          Spoiler kurallarına aykırı şekilde diğer kullanıcıların deneyimini
          bozmak.
        </li>
      </ul>
      <p>
        Bu kurallara aykırı davranan hesaplara uyarı, geçici veya kalıcı
        yasaklama uygulanabilir.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        4. İçerik Hakları
      </h2>
      <p>
        Dizi, film ve kitaplara ait görsel ve bilgiler TMDB, Google Books
        gibi üçüncü taraf kaynaklardan sağlanır ve ilgili hak sahiplerine
        aittir. Paylaştığınız yorum ve içeriklerden siz sorumlusunuz.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        5. Moderasyon
      </h2>
      <p>
        Kurallara aykırı içerikleri kaldırma ve gerekli gördüğümüz
        hesaplara işlem uygulama hakkını saklı tutarız.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        6. Sorumluluğun Sınırlandırılması
      </h2>
      <p>
        StoryKind &quot;olduğu gibi&quot; sunulur. Hizmetin kesintisiz veya
        hatasız olacağını garanti etmeyiz. Üçüncü taraf içeriklerinin
        doğruluğundan sorumlu değiliz.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        7. Hesap Kapatma
      </h2>
      <p>
        Hesabınızı istediğiniz zaman uygulama içinden silebilirsiniz.
        Koşulları ihlal eden hesapları askıya alma veya kapatma hakkımız
        saklıdır.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        8. Değişiklikler
      </h2>
      <p>
        Bu koşulları zaman zaman güncelleyebiliriz. Güncel sürüm bu sayfada
        yayınlanır.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32 }}>
        9. İletişim
      </h2>
      <p>
        Sorularınız için:
        <br />
        <a href="mailto:yusufhyigit55@gmail.com">yusufhyigit55@gmail.com</a>
      </p>
    </main>
  );
}