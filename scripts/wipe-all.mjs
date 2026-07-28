// scripts/wipe-all.mjs — TÜM veritabanını temizler. DİKKAT: geri alınamaz.
// Kullanım:
//   node scripts/wipe-all.mjs          → sadece gösterir (silmez)
//   node scripts/wipe-all.mjs --confirm → gerçekten siler
import mongoose from "mongoose";
import { readFileSync } from "fs";

// .env.local dosyasını elle oku (dotenv gerektirmez)
let URI = process.env.MONGODB_URI;
if (!URI) {
  try {
    const env = readFileSync(".env.local", "utf8");
    const match = env.match(/^MONGODB_URI\s*=\s*(.+)$/m);
    if (match) {
      URI = match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch (e) {
    // dosya yoksa aşağıda hata verecek
  }
}
if (!URI) {
  console.error("HATA: MONGODB_URI bulunamadı (.env.local)");
  process.exit(1);
}

const confirmed = process.argv.includes("--confirm");

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`\nVeritabanı: ${dbName}\n`);

  const collections = await db.listCollections().toArray();
  if (collections.length === 0) {
    console.log("Koleksiyon yok, veritabanı zaten boş.");
    await mongoose.disconnect();
    return;
  }

  console.log("Koleksiyonlar ve kayıt sayıları:");
  let total = 0;
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    total += count;
    console.log(`  - ${c.name}: ${count} kayıt`);
  }
  console.log(`\nTOPLAM: ${total} kayıt, ${collections.length} koleksiyon\n`);

  if (!confirmed) {
    console.log("⚠️  Bu bir ÖN İZLEME. Hiçbir şey silinmedi.");
    console.log("Gerçekten silmek için: node scripts/wipe-all.mjs --confirm\n");
    await mongoose.disconnect();
    return;
  }

  console.log("🗑️  SİLİNİYOR...\n");
  for (const c of collections) {
    const res = await db.collection(c.name).deleteMany({});
    console.log(`  ✓ ${c.name}: ${res.deletedCount} kayıt silindi`);
  }
  console.log("\n✅ Tüm veriler silindi. Veritabanı temiz.\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});