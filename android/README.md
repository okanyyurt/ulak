# Ulak — Android Uygulaması

Herhangi bir uygulamada **Paylaş → Ulak** seçildiğinde kanal kodunu sorar ve içeriği `https://ulak.gryntech.net` üzerindeki o kanala gönderir. Tüm cihazlar aynı sunucu üzerinden eşitlenir. Yönetici paneli yoktur.

## Özellikler

- **Paylaşım hedefi:** Fotoğraf, metin/link, PDF, Word, Excel, PowerPoint, ODF, CSV, TXT, ZIP, RAR, 7Z — tekli ve çoklu seçim.
- **Kanal kodu:** `a123` yazmak ya da tam linki (`https://ulak.gryntech.net/a123`) yapıştırmak yeterli. Son 6 kanal tek dokunuşla gönderilir.
- **Direct Share:** Kullanılan kanallar Android paylaşım menüsünde doğrudan "Ulak · a123" olarak çıkar; dokununca hiç soru sorulmadan gönderilir.
- **Kanal yoksa:** "Bu kodla yeni kanal aç ve gönder" seçeneği (1 saatlik kanal).
- **Arka planda gönderim:** Paylaşım ekranı hemen kapanır; yükleme WorkManager ile bildirimde ilerleme göstererek sürer, internet kesilirse kaldığı öğeden devam eder, bildirimden iptal edilebilir.
- **Ana ekran:** Sitenin kendisi (oda görüntüleme, LivePad, indirme) kilitli bir WebView içinde.

## Performans

- Fotoğraflar web ile aynı şekilde küçültülür (en uzun kenar 1920 px, JPEG %82); 50 MP fotoğraf bile örneklenerek çözülür, belleğe tam boy yüklenmez. HEIC desteklenir (Android 9+).
- Belgeler 1 MB'lık parçalarla gönderilir; her parça ayrı ayrı yeniden denenir, kopan bağlantıda baştan başlanmaz.
- Kanal kontrolü hafif `room_info` ucuyla yapılır: odadaki içerik indirilmez ve "okununca imha" sayacı yanlışlıkla başlamaz.
- Tek paylaşılan OkHttp istemcisi (bağlantı havuzu, HTTP/2), bildirim güncellemeleri 400 ms'de bir.
- Release APK ≈ 1,6 MB (R8 küçültme + kaynak budama).

## Güvenlik

- Yalnızca HTTPS; sadece sistem sertifikalarına güvenilir (kullanıcı tarafından eklenen CA ile araya girilemez). Yönlendirme takip edilmez.
- WebView yalnızca `ulak.gryntech.net` sayfalarını açar; diğer linkler tarayıcıya gider. Dosya/içerik erişimi kapalı, karışık içerik yasak, Safe Browsing açık, kamera/mikrofon izinleri reddedilir, JavaScript köprüsü yok.
- Paylaşım alıcısı yalnızca `content://` URI kabul eder (`file://` ile uygulamanın kendi dosyalarını sızdırma saldırısı engellenir). Dosya adları temizlenir.
- Paylaşılan dosyalar gönderilene kadar uygulamanın özel önbelleğinde tutulur, sonra silinir; yarım kalanlar 48 saatte temizlenir.
- Yedekleme kapalı (`allowBackup=false`, veri aktarım kuralları) — cihaz kimliği ve kanal geçmişi başka cihaza taşınmaz.
- Dışa açık bileşenler yalnızca ana ekran ve paylaşım ekranı.

## Derleme

Gerekenler: JDK 17+ (21 test edildi), Android SDK (platform 36, build-tools 36).

```bash
cd android
./gradlew assembleDebug
```

Çıktı: `app/build/outputs/apk/debug/app-debug.apk` (debug sürüm `net.gryntech.ulak.debug` paket adıyla, mağaza sürümünün yanına kurulabilir).

> **Windows + Türkçe karakterli kullanıcı klasörü:** Gradle "Unable to establish loopback connection" hatası verirse JVM'e ASCII bir geçici klasör verin:
> `set JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp -Djava.io.tmpdir=C:\Temp`

### Telefona kurulum

Telefonda **Geliştirici seçenekleri → USB hata ayıklama** açıkken USB ile bağlayın:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Play Store için imzalı sürüm

1. Bir kez anahtar oluşturun (şifreyi kaybetmeyin, bu dosyayı **asla** git'e eklemeyin):
   `keytool -genkeypair -v -keystore ulak-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias ulak`
2. `android/keystore.properties` dosyası oluşturun (git'te yok sayılıyor):
   ```
   storeFile=ulak-release.jks
   storePassword=...
   keyAlias=ulak
   keyPassword=...
   ```
3. `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`

### Linklerin doğrudan uygulamada açılması (App Links)

`https://ulak.gryntech.net/a123` linklerinin tarayıcı yerine uygulamada açılması için sunucuya `/.well-known/assetlinks.json` koyun (SHA-256, imza anahtarınızdan: `keytool -list -v -keystore ulak-release.jks -alias ulak`; Play App Signing kullanıyorsanız Play Console'daki değer):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "net.gryntech.ulak",
    "sha256_cert_fingerprints": ["AA:BB:...:FF"]
  }
}]
```

## Sunucu gereksinimi

Uygulama `api.php`'nin şu uçlarını kullanır: `room_info`, `get_settings`, `create_room`, `add_item`, `upload_init`, `upload_chunk`, `upload_complete`. Bu uçlar `public/api.php` içinde; sunucu güncel değilse önce `npm run deploy` ile yükleyin.

## Kod yapısı

```
app/src/main/java/net/gryntech/ulak/
├── UlakApp.kt                 bildirim kanalları, eski iş temizliği
├── core/ChannelCode.kt        kanal kodu / link ayrıştırma ve doğrulama
├── data/Prefs.kt              cihaz kimliği, cihaz adı, son kanallar (DataStore)
├── net/UlakApi.kt             api.php istemcisi (OkHttp, yeniden deneme, parçalı yükleme)
├── share/                     paylaşım ekranı, intent ayrıştırma, Direct Share kısayolları
├── upload/                    giden kutusu, görsel sıkıştırma, arka plan yükleyici (WorkManager)
├── main/                      WebView ana ekran, indirmeler
└── ui/Theme.kt                sitenin koyu renk paleti
```
