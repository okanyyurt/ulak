# Ulak — Android Uygulama Planı

> **Durum (23.10.2026):** Aşama 1'in çekirdeği yazıldı → [`android/`](../android/README.md). Paylaşım hedefi, kanal kodu / son kanallar, Direct Share, arka planda parçalı yükleme ve WebView ana ekran hazır. QR ile kanal okuma ve Play Store yayını henüz yapılmadı.

## Hedef

Galeride, dosya yöneticisinde ya da herhangi bir uygulamada **Paylaş** dendiğinde listede **Ulak** çıksın. Ulak açılınca kullanıcı **kanal (oda) kodunu** girsin (veya son kullandığı kanallardan birini seçsin) ve içerik o odaya gönderilsin. Odadaki diğer cihazlar (web, masaüstü) içeriği anında görsün.

## Önerilen yol: iki aşama

### Aşama 0 — PWA "Share Target" (1–2 gün, mağazaya gerek yok)

Mevcut site, `manifest.webmanifest` + service worker eklenerek **yüklenebilir uygulama (PWA)** haline getirilir. Android Chrome'da "Ana ekrana ekle" yapılınca Ulak, sistem paylaşım menüsünde görünür (Web Share Target API).

```json
"share_target": {
  "action": "share-target",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "title": "title", "text": "text", "url": "url",
              "files": [{ "name": "files", "accept": ["image/*", "*/*"] }] }
}
```

Akış: service worker `POST /share-target` isteğini yakalar → dosyaları IndexedDB'ye koyar → `/share.html`'e yönlendirir → kullanıcı kanal kodunu girer → mevcut `api.php?action=add_item` ile gönderilir.

- ✅ Hemen çalışır, iOS dışındaki tüm Android cihazlarda; masaüstü Chrome'da da.
- ✅ İstenirse **Bubblewrap / TWA** ile aynı PWA, Play Store'a da konabilir.
- ❌ Sadece kullanıcı PWA'yı yüklediyse paylaşım menüsünde görünür; Direct Share (son kanallar) yok.

### Aşama 1 — Yerli (native) Android uygulaması (önerilen nihai çözüm)

**Teknoloji:** Kotlin, Jetpack Compose, minSdk 26 (Android 8), OkHttp/Retrofit, DataStore, WorkManager, CameraX + ML Kit (QR okuma).

**Hibrit mimari** — en hızlı ve en az bakım isteyen yol:
- **Paylaşım alıcı ekran (native):** Asıl istenen özellik; tamamen yerli, hızlı, alt sayfa (bottom sheet) görünümünde.
- **Oda ekranı (WebView):** Mevcut web arayüzü `https://ulak.gryntech.net/<kod>` WebView'da açılır; web'deki her yenilik uygulamaya otomatik gelir.

#### Paylaşım menüsüne kayıt (`AndroidManifest.xml`)

```xml
<activity android:name=".share.ShareReceiverActivity"
          android:exported="true"
          android:theme="@style/Theme.Ulak.BottomSheet">
  <intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
    <data android:mimeType="image/*" />
    <data android:mimeType="*/*" />
  </intent-filter>
  <intent-filter>
    <action android:name="android.intent.action.SEND_MULTIPLE" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
    <data android:mimeType="*/*" />
  </intent-filter>
  <!-- Son kanalları paylaşım menüsünde doğrudan göstermek için -->
  <meta-data android:name="android.service.chooser.chooser_target_service"
             android:value="androidx.sharetarget.ChooserTargetServiceCompat" />
</activity>

<!-- ulak.gryntech.net/<kod> linkleri doğrudan uygulamada açılsın (App Links) -->
<activity android:name=".MainActivity" android:exported="true">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="ulak.gryntech.net" />
  </intent-filter>
</activity>
```

#### Paylaşım ekranı akışı

1. `Intent.EXTRA_TEXT` (metin/link) veya `EXTRA_STREAM` (bir ya da çok sayıda `Uri`) okunur → küçük önizleme gösterilir.
2. **Kanal kodu** alanı (4–32 karakter, otomatik küçük harf) + altta **son kullanılan kanallar** çipleri + **QR ile tara** butonu.
3. "Gönder" → kod `get_room` ile doğrulanır (404 → "Kanal bulunamadı / süresi dolmuş").
4. Görseller web ile aynı şekilde işlenir: en uzun kenar 1920 px, JPEG %82 → `data:image/jpeg;base64,...` → `add_item`.
5. Gönderim **WorkManager** ile yapılır: kullanıcı ekranı kapatsa da yükleme biter, bildirimle sonuç gösterilir.
6. Başarılı kanal **Direct Share kısayolu** olarak kaydedilir (`ShortcutManagerCompat.pushDynamicShortcut`) → bir sonraki paylaşımda menüde doğrudan "Ulak · a1b2" çıkar, kod girmeye gerek kalmaz.

#### Uygulama modülleri

```
app/
 ├─ share/      ShareReceiverActivity, ShareViewModel, ShareSheet (Compose)
 ├─ room/       MainActivity, RoomWebView, katıl/oluştur ekranı
 ├─ data/       UlakApi (OkHttp), RecentChannelsStore (DataStore), ImageCompressor
 ├─ work/       UploadWorker (WorkManager, ilerleme bildirimi)
 └─ qr/         QrScanActivity (CameraX + ML Kit barcode)
```

Ayarlar: sunucu adresi (varsayılan `https://ulak.gryntech.net`, kendi sunucusunu kuranlar için değiştirilebilir), cihaz adı.

## Sunucu tarafında gerekenler

| İhtiyaç | Neden | Öneri |
|---------|-------|-------|
| **Genel dosya desteği** (PDF, Office, ZIP/RAR) | ✅ **Yapıldı.** | Uygulama aynı parçalı akışı kullanır: `upload_init` → `upload_chunk` (1 MB, `application/octet-stream`) → `upload_complete`; izinli türler ve boyut sınırı `get_settings` ile okunur. Video vb. yeni tür gerekirse admin ayarlarına yeni grup eklenir. |
| **Delta yoklama** | Her 1,5 sn'de tüm görseller tekrar iniyor — mobil veri için kabul edilemez | `get_room&since=<itemsModified>` → sadece yeni öğeler; görseller ayrı uçtan, önbelleklenebilir şekilde. |
| **Sürümlü API** | Uygulama mağazadayken sunucu değişirse eski sürümler kırılmasın | `api.php?v=1&action=...` veya `/api/v1/`; yanıtta `minClientVersion`. |
| **CORS / kaynak kontrolü** | Native uygulama CORS'a takılmaz; sorun yok | Değişiklik gerekmez. |
| **App Links doğrulaması** | `ulak.gryntech.net/<kod>` linkleri uygulamada açılsın | `/.well-known/assetlinks.json` (uygulamanın imza SHA-256'sı ile). |
| **Kötüye kullanım sınırları** | Uygulama ile otomatik toplu gönderim kolaylaşır | Bu çalışmada eklenen IP başına hız sınırları yeterli bir başlangıç. |

## Zaman çizelgesi (tahmini)

| Hafta | İş |
|-------|-----|
| 1 | Aşama 0 (PWA share target) canlıda · sunucuda delta yoklama |
| 2 | Native iskelet, paylaşım ekranı (metin + görsel), son kanallar, WorkManager |
| 3 | QR tarama, Direct Share kısayolları, WebView oda ekranı, App Links |
| 4 | Sunucuda dosya desteği + uygulamada genel dosya gönderimi |
| 5 | Test (farklı üreticiler, Android 8–15), Play Console iç test, mağaza görselleri, gizlilik politikası |

## Play Store notları

- **Veri güvenliği formu:** Kullanıcı içeriği sunucuya geçici olarak gönderiliyor, şifreleme (HTTPS) var, paylaşım üçüncü taraflarla yapılmıyor, kullanıcı silebiliyor (İmha Et).
- **İzinler:** `INTERNET`, `CAMERA` (yalnızca QR için, çalışma zamanında istenir), `POST_NOTIFICATIONS` (Android 13+, yükleme bildirimi). Depolama izni **gerekmez** — paylaşılan `Uri`'ler geçici okuma izniyle gelir.
- Gizlilik politikası sayfası gerekli (mevcut "Yasal Uyarı & Gizlilik" metni genişletilebilir).
