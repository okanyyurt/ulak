/**
 * Ulak — Automated FTP Deployment Script
 * Uploads all production files from 'public/' directly to the remote server.
 */

require('dotenv').config();
const path = require('path');
const ftp = require('basic-ftp');

async function deploy() {
  const host = process.env.FTP_HOST || 'okanyesilyurt.com';
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASS;
  const remoteDir = process.env.FTP_REMOTE_DIR || 'public_html/c';

  if (!user || !password) {
    console.error('❌ Hata: .env dosyasında FTP_USER veya FTP_PASS tanımlanmamış!');
    process.exit(1);
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  console.log('====================================================');
  console.log('🚀 ULAK — Otomatik FTP Dağıtımı Başlatılıyor...');
  console.log(`📡 Sunucu:    ${host}`);
  console.log(`👤 Kullanıcı: ${user}`);
  console.log(`📁 Hedef:     /${remoteDir}`);
  console.log('====================================================');

  const startTime = Date.now();

  try {
    console.log('⏳ FTP sunucusuna bağlanılıyor...');
    await client.access({
      host,
      user,
      password,
      secure: false
    });
    console.log('✅ Bağlantı başarılı!');

    const localDir = path.join(__dirname, 'public');
    console.log(`📤 'public/' klasöründeki dosyalar yükleniyor...`);

    // Ensure remote directory exists and cd to it
    await client.ensureDir(remoteDir);

    // Track uploads
    client.trackProgress(info => {
      if (info.type === 'upload') {
        const percent = Math.round((info.bytes / info.bytesOverall) * 100);
        process.stdout.write(`\r📦 Yükleniyor: ${info.name} [${percent}%] (${(info.bytes / 1024).toFixed(1)} KB)`);
      }
    });

    // Upload entire directory
    await client.uploadFromDir(localDir, remoteDir);

    console.log('\n');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('====================================================');
    console.log(`🎉 BAŞARILI! Siteniz ${elapsed} saniyede güncellendi!`);
    console.log(`🌐 Canlı Adres: https://${host}/c`);
    console.log(`🎛️  Yönetici:    https://${host}/c/admin.html`);
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ FTP Dağıtım Hatası:', err.message || err);
    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();
