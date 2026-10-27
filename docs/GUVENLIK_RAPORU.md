# Ulak — Güvenlik İnceleme Raporu

**Tarih:** 22.10.2026 · **Kapsam:** `api.php` (canlıdaki PHP backend), `server.js` (Node backend), `app.js`, `admin.html`, `.htaccess`, `deploy.js`
**Canlı ortam:** https://ulak.gryntech.net (LiteSpeed + PHP, `data/` klasörü dışarıdan 403 — doğrulandı)

---

## Kapsamlı tehdit incelemesi (23.10.2026)

Arayüzdeki son değişiklikler (`admin.html`, `app.js`, `index.*`, `style.css`, yeni görseller) incelendi: yeni bir API çağrısı veya HTML enjeksiyon noktası eklenmemiş, önceki XSS korumaları yerinde. Dışarıdan yalnızca Google Fonts yükleniyor. Canlıda güvenlik başlıkları aktif, `data/`, `.env`, `.git` 403; 500 hatası düzeltmesi yayında (30/30 başarılı).

### 1. Admin şifresini ele geçiren biri sunucuya sızabilir mi?

**Uygulama üzerinden hayır.** Admin uçları dosya yazdırmaz, kod çalıştırmaz: ayarlar yalnızca sayı ve sabit listeden seçim kabul eder, dosya türleri beyaz listede (PHP/HTML yüklenemez), yüklenen dosyalar uzantısız rastgele adla, web'den erişilemeyen `data/` altında durur; `include`/`eval`/`unserialize`/SQL yok. PHP 8.3 üzerinde gerçek isteklerle doğrulandı.

**Ama şunları yapabilir:**

| Yapabileceği | Etkisi |
|---|---|
| Tüm aktif odaların kodlarını görür → **her odaya girip tüm metin, fotoğraf ve dosyaları okur** | Kullanıcı gizliliğinin tamamen kaybı |
| Tüm odaları siler, şifreyi değiştirip sizi dışarıda bırakır | Hizmet kesintisi |
| Dosya sınırını 500 MB'a, oda kotasını 2 GB'a çıkarır | Hosting diskinin doldurulmasına zemin hazırlar (aynı hesaptaki diğer siteler de etkilenir) |

**Gerçek sızma yolları admin şifresi değil, şunlar:**
- **FTP/cPanel bilgileri.** `.env` dosyasındaki FTP kullanıcısı `okanyesilyurt.com` hesabının `public_html`'ine yazabiliyor ve bu dosya **kurumsal OneDrive'da (kapeks.com.tr) senkronize ediliyor**. `okanyesilyurt.com`, `gryntech.net` ve `ulak.gryntech.net` aynı sunucuda (142.132.252.181). Bu bilgiye erişen, üç siteye de PHP dosyası yükleyip sunucu hesabını tamamen ele geçirebilir.
- **Şifre tekrarı.** Admin şifresi FTP/cPanel/e-posta şifresiyle aynıysa admin şifresinin sızması doğrudan sunucu sızması olur.
- **Admin oturum anahtarı.** Paneldeki "Git" linkleri `target="_blank"` ile ve `noopener` olmadan açılıyor; tarayıcı `sessionStorage`'ı (admin anahtarı dahil) yeni sekmeye kopyalar. Oda sayfasında bir XSS bulunursa anahtar çalınabilir (şu an bilinen XSS yok — derinlemesine savunma eksiği).

### 2. Siteye sızan biri kullanıcılara ve siteye ne kadar zarar verebilir?

**Sunucuya (FTP/hosting) erişen saldırgan:**
- `app.js`'i değiştirip kullanıcıların yapıştırdığı **her şeyi** (şifreler, kodlar, belgeler) kendi sunucusuna gönderebilir; fark edilmesi zordur.
- Sahte "indir" düğmeleriyle zararlı yazılım veya oltalama dağıtabilir; alan adı Google Safe Browsing kara listesine girer (gryntech.net markası zarar görür).
- `data/` altındaki tüm oda içeriklerini ve dosyaları okur (içerik sunucuda şifresiz).
- Aynı hosting hesabındaki diğer sitelere de dokunur.
- Android uygulaması siteyi kilitli WebView'da açtığından telefonlarda kod çalıştıramaz, ama uygulamanın gönderdiği dosyalar saldırganın kontrolündeki sunucuya gider.

**Sunucuya erişemeyen dışarıdaki saldırgan (doğrulanan zayıflıklar):**

| # | Zayıflık | Önem |
|---|---|---|
| A | **İstatistik ucu ile hizmet engelleme.** `track` sınırsız; rastgele kimliklerle günün istatistik dosyası şişiriliyor. Ölçüm (PHP 8.3): 1 M sahte ziyaretçi → dosya 20 MB, istek başına 3 ms → **614 ms**. Her odadaki her cihaz 1,5 sn'de bir aynı dosyayı kilitleyip yeniden yazdığından site fiilen durur. | **Yüksek** |
| B | **Toplam disk sınırı yok.** IP başına 10 dk'da 30 oda × 100 MB kota; yarım bırakılan yüklemeler (120 × 25 MB) kotaya sayılmıyor ve 1 saat diskte kalıyor. Disk dolunca aynı hesaptaki siteler (e-posta, veritabanı) da etkilenir. | **Yüksek** |
| C | **Oda kodu tahmini.** 4 karakter = 1,68 M ihtimal; IP başına 10 dk'da 60 deneme. 100 aktif oda varken tek IP ~2 günde, 100 IP ~30 dakikada bir oda bulur. Özel kodlar (`test`, `ofis`, `a123`) çok daha kolay tahmin edilir. | Orta |
| D | **Odada herkes her şeyi silebilir** (kod bilen biri odayı imha edebilir). | Orta |
| E | **Admin giriş kilidi yalnızca IP başına.** Şifre kuralı olmadığı için zayıf bir şifre, çok IP'li dağıtık denemeyle bulunabilir. | Orta |
| F | **Hosting erişim logları oda kodlarını içerir** (`get_room&id=…`, `get_file&room=…`). Logları gören herkes odalara girebilir. | Düşük |
| G | `index.php` içinde `__APP_DIR__` kaçışsız basılıyor (sunucu kontrollü değer, pratikte istismar edilemez); hız sınırı dosya adlarındaki `sha1(IP)` geri çevrilebilir. | Düşük |

### 3. Site yasa dışı işler için kullanılabilir mi?

**Evet, risk gerçek.** Hesapsız, anonim, otomatik silinen dosya/metin paylaşımı kötüye kullanım için cazip: oltalama ve zararlı yazılım linki dağıtımı, korsan içerik, çalıntı veri (şifre listeleri, kimlik bilgileri) alışverişi, taciz ve en ağır durumda çocuk istismarı içeriği. "Kendini imha eden" yapı delil karartmaya uygun görüldüğü için bu tür kullanıcıları çeker. Şu an sistemde kimin neyi yüklediğine dair **hiçbir kayıt yok** ve kötüye kullanım bildirme yolu yok.

**Olursa ne olur (olası sonuçlar):**
- Hosting firması şikâyet üzerine **hesabı askıya alır** → üç site birden kapanır.
- Google Safe Browsing / antivirüs firmaları alan adını "tehlikeli" işaretler; e-postalarınız spam'e düşer.
- BTK veya mahkeme kararıyla alan adına **erişim engeli** gelebilir.
- Savcılık "kim yükledi" diye kayıt isteyebilir. Türkiye'de 5651 sayılı Kanun kapsamında **yer sağlayıcı** sayılabilirsiniz: içeriği önceden denetleme yükümlülüğünüz yok, ama bildirim gelince kaldırma ve trafik bilgisini belirli süre saklama yükümlülükleri olabilir. Kayıt tutmamak idari para cezasına yol açabilir. *(Bu hukuki görüş değildir; bir avukata danışmanız önerilir.)*
- IP gibi kayıtlar tutulmaya başlanırsa KVKK kapsamında aydınlatma metni gerekir.

**Tamamen engellenemez; ama site kötüye kullanım için cazip olmaktan çıkarılabilir:**
1. **Odada "Kötüye kullanım bildir" düğmesi** + admin panelinde şikâyet listesi ve tek tıkla imha (bildirim → kaldırma süreci).
2. **Dosya başına indirme sınırı** (ör. günde 50) ve odadaki cihaz sayısı sınırı → site "ücretsiz dosya barındırma" olarak kullanılamaz.
3. **Asgari kayıt:** oda oluşturma / dosya yükleme anında IP + zaman + oda + dosya hash'i; erişimi kısıtlı, süreli saklama; gizlilik metninde açıkça belirtme.
4. **Kullanım koşulları:** oda açarken "yasa dışı içerik yasaktır, kayıt tutulur" onayı.
5. **Arşivleri varsayılan kapatmak** (zararlı yazılımın ana taşıyıcısı ZIP/RAR) — admin panelinden zaten yapılabiliyor.
6. **Cloudflare** (ücretsiz): DDoS/bot koruması, IP itibarı, WAF.
7. Daha ileri seviye: **uçtan uca şifreleme** (sunucu içeriği hiç görmez → sızıntıda kullanıcı verisi korunur; ama siz de içerik denetleyemezsiniz — bu bir tasarım tercihi).

### Uygulanan önlemler (24.10.2026, onaylı liste)

| Önlem | Durum | Ayrıntı |
|---|---|---|
| İstatistik koruması | ✅ | `track` IP başına 10 dk'da 30; günlük hash kümesi 20 000 ile sınırlı (sonrası sayılır ama dosya büyümez); oda yoklaması istatistiği her 1,5 sn yerine yalnızca cihaz odaya ilk girdiğinde ve oda başına dakikada bir yazar |
| Toplam disk sınırı | ✅ | Sunucu geneli toplam alan (varsayılan 2 GB, başlamış yüklemeler dahil), IP başına saatlik yükleme hacmi (500 MB), oda başına metin+fotoğraf 40 MB — hepsi admin panelinden ayarlanır |
| Admin girişi | ✅ | IP başına kilit + tüm IP'ler genelinde 10 hatadan sonra artan bekleme (en fazla 60 sn); paneldeki oda linkleri `noopener` (admin anahtarı yeni sekmeye kopyalanmaz) |
| Kötüye kullanım bildirimi | ✅ | Odada "Bildir" düğmesi (IP başına saatte 5); admin panelinde Şikâyetler: odaya bak, imha et, çözüldü işaretle |
| Dosya indirme sınırı | ✅ | Dosya başına günlük indirme (varsayılan 50, 0 = sınırsız) |
| Yükleme kaydı (IP) | ✅ | Oda açma, paylaşım, dosya yükleme, bildirim, imha → IP + zaman + oda + SHA-256 (içerik yok); varsayılan 90 gün, 0 = kapalı; admin panelinde arama ve CSV |
| Kullanım koşulları onayı | ✅ | Oda açmadan/katılmadan önce bir kez; sunucu da `acceptTerms` olmadan oda açmaz; yasal metne "Kayıtlar ve Kötüye Kullanım Bildirimi" bölümü eklendi |
| İçerik Güvenlik Politikası | ✅ | `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`; tüm satır içi script'ler dosyaya taşındı (`theme-init.js`, `admin.js`) |
| Odayı sadece kurucu imha etsin | ✅ | Oda açan cihaza sahip anahtarı verilir (sunucuda yalnızca hash'i); diğerleri öğe silebilir, odayı imha edemez |
| Küçük düzeltmeler | ✅ | Hız sınırı dosya adları tuzlu HMAC (IP geri çevrilemez); `index.php` uygulama klasörünü kaçışlı öznitelikle verir |
| Arşivler varsayılan kapalı | ✅ | ZIP/RAR/7Z admin panelinden açılabilir |
| 6 karakterli oda kodu / oda kodunu loglardan gizleme | — | Seçilmedi |

**Test:** PHP 8.3 (WebAssembly) üzerinde 2 test seti (52 kontrol) ve Node üzerinde 15 kontrol; tarayıcıda koşullar penceresi, sahip/sahip olmayan cihaz, bildirim akışı ve admin paneli CSP ihlalsiz denendi.

**Yayına alırken:** `admin.js` ve `theme-init.js` yeni dosyalar (deploy `public/` klasörünü olduğu gibi yüklediği için otomatik gider). Daha önce admin panelinden dosya ayarı kaydettiyseniz arşivler o ayarda açık kalır; kapatmak için paneldeki kutuyu kaldırın.

### Sizin tarafınızda kalanlar

| İş | Not |
|---|---|
| Hosting panelinde 2FA, ayrı FTP kullanıcısı | Yerel bilgilerin güvenli olduğunu belirttiniz |
| 5651/KVKK için hukuki görüş | Kayıt süresi (varsayılan 90 gün) buna göre ayarlanmalı |
| Cloudflare (isteğe bağlı) | DDoS/bot koruması |

---|---|---|
| 1 | FTP bilgilerini OneDrive dışına taşı; bu klasöre özel ayrı FTP kullanıcısı aç; hosting panelinde 2FA; admin şifresini başka hiçbir yerde kullanma | Siz |
| 2 | `track` hız sınırı + günlük hash sayısına üst sınır; oda yoklamasında istatistiği yalnızca cihaz odaya ilk girdiğinde yaz | Kod |
| 3 | Toplam disk sınırı (yarım yüklemeler dahil) + IP başına saatlik yükleme hacmi | Kod |
| 4 | Kötüye kullanım bildirimi + dosya indirme sınırı + asgari yükleme kaydı + kullanım koşulları onayı | Kod + karar |
| 5 | Otomatik oda kodlarını 6+ karaktere çıkar; admin linklerine `noopener`; global admin giriş yavaşlatması; CSP | Kod |
| 6 | 5651/KVKK yükümlülükleri için hukuki görüş | Siz |

## Özet

| # | Bulgu | Önem | Durum |
|---|-------|------|-------|
| 1 | Admin şifresi kodda sabit `admin/admin`, giriş sayfasında ipucu olarak yazıyor ve form alanları dolu geliyor | **Kritik** | ✅ Düzeltildi |
| 2 | Paylaşılan görsel (`item.content`) ve dosya adı HTML'e kaçışsız basılıyor → odaya katılan herkes diğer cihazlarda JavaScript çalıştırabiliyor (stored XSS) | **Kritik** | ✅ Düzeltildi |
| 3 | LivePad parçalarındaki `color` alanı CSS sınıfına kaçışsız basılıyor → XSS | **Yüksek** | ✅ Düzeltildi |
| 4 | Mevcut bir oda koduyla "özel kod" oluşturmak odayı **siliyor/üzerine yazıyor** | **Yüksek** | ✅ Düzeltildi (409) |
| 5 | Admin girişinde deneme sınırı yok (kaba kuvvet) | **Yüksek** | ✅ 5 deneme / 15 dk kilit |
| 6 | 4 karakterlik oda kodları (36⁴ ≈ 1,68 M) sınırsız denenebiliyor → başkalarının panosu okunabilir | **Yüksek** | 🟡 Hafifletildi (IP başına 10 dk'da 60 hatalı deneme) |
| 7 | Admin token URL'de (`?admin_token=`) taşınıyor → sunucu loglarına, geçmişe düşüyor; `localStorage`'da süresiz kalıyor | Orta | ✅ Yalnızca başlıkta, `sessionStorage`, 8 saat |
| 8 | Token'lar diskte düz metin | Orta | ✅ SHA-256 hash olarak saklanıyor |
| 9 | İçerik boyutu / tipi doğrulanmıyor (disk doldurma, bozuk veri) | Orta | ✅ Tip beyaz listesi + boyut sınırları |
| 10 | Oda oluşturma sınırsız | Orta | ✅ IP başına 10 dk'da 30 |
| 11 | Oda ID'si `rand()` / `Math.random()` ile üretiliyor | Düşük | ✅ `random_int` / `crypto.randomInt` |
| 12 | QR kütüphanesi yüklenemezse oda linki üçüncü taraf `api.qrserver.com`'a gidiyor | Düşük (gizlilik) | ✅ Kaldırıldı |
| 13 | Güvenlik başlıkları yok (nosniff, frame, referrer, HSTS) | Düşük | ✅ `.htaccess` + Node |
| 14 | Deploy düz FTP ile yapılıyor (şifre ağda açık) | Orta | ✅ Varsayılan FTPS (`FTP_SECURE=false` ile kapatılabilir) |
| 15 | Admin uçlarında `Access-Control-Allow-Origin: *` | Düşük | ✅ Admin uçlarında kaldırıldı |

## Admin şifresi — yeni tasarım

- Şifre artık kodda değil; **`data/admin_config.php`** içinde `password_hash()` (bcrypt) olarak saklanır. Dosya `<?php exit; ?>` ile başlar, `.htaccess` çalışmasa bile içeriği web'den okunamaz.
- Ayar dosyası yoksa (ilk kurulum) eski `admin/admin` **yalnızca şifre değiştirmek için** kabul edilir; diğer tüm admin uçları `403 mustChangePassword` döner. Panel bu durumda kapatılamayan "Şifre Değiştir" penceresini açar.
- **Şifre Değiştir** butonu panelin üst menüsünde. Mevcut şifre zorunlu; kullanıcı adı da değiştirilebilir. Yönetici isteğiyle şifre kuralı yoktur (yalnızca boş olamaz); güç, deneme kilidi ve hash ile sağlanır.
- Değişiklikten sonra diğer tüm admin oturumları iptal edilir.
- Node backend aynı akışı scrypt hash ile `data/admin_config.json` üzerinden uygular (`ADMIN_USER`/`ADMIN_PASS` env varsa başlangıç bilgisi olarak kullanılır).

> ⚠️ **Yayına alma sonrası hemen yapılacak:** Deploy'dan sonra `/admin.html`'e girip şifreyi değiştirin. Değiştirilene kadar `admin/admin` bilen herkes şifreyi belirleyebilir (bugün zaten herkes tam yetkiyle girebiliyor).

## Dosya paylaşımı ve istatistikler (sonradan eklendi)

- **Yükleme:** Yalnızca beyaz listedeki uzantılar (PDF, Office, ZIP/RAR/7Z, TXT/CSV). İlk parçada dosya imzası (magic bytes) kontrol edilir; adı `.pdf` yapılmış bir `.exe` veya HTML reddedilir. Dosya adı temizlenir (`../` vb. yol denemeleri etkisiz).
- **Saklama:** `data/files/<oda>/<32 karakter rastgele id>` — uzantısız, web'den doğrudan erişilemez (`data/` 403). Oda silinince, süresi dolunca veya öğe silinince dosya da silinir; yarım kalan yüklemeler 1 saat sonra temizlenir.
- **İndirme:** Oda kodu + rastgele dosya id'si gerekir; her zaman `Content-Disposition: attachment`, `nosniff` ve `CSP: sandbox` ile — tarayıcıda çalıştırılamaz.
- **Kötüye kullanım:** Dosya başına boyut ve oda başına kota admin panelinden ayarlanır; IP başına 10 dk'da 120 yükleme başlatma sınırı.
- **Kalan risk:** Dosyalar virüs taramasından geçmiyor (paylaşımlı hostingde ClamAV genelde yok). Office makroları ve arşiv içerikleri olduğu gibi aktarılır — kullanıcıya "tanımadığınız kişilerden gelen dosyaları açmayın" uyarısı önerilir.
- **İstatistik gizliliği:** Ziyaretçi ve oda kimlikleri, gizli bir tuz + tarih ile SHA-256'lanıp kısaltılarak sayılır; ertesi gün bu hash'ler de silinip yalnızca sayılar kalır. IP adresi saklanmaz. Yine de Yasal Uyarı & Gizlilik metnine "anonim kullanım istatistikleri tutulur" cümlesi eklenmesi önerilir (KVKK açısından şeffaflık).

## Düzeltilen üretim hatası (23.10.2026)

- `api.php`'deki periyodik temizlik rutini, dosyanın ilerisinde tanımlanan `STATS_*` sabitlerini tanımlanmadan önce kullanıyordu. İstatistik dosyaları oluştuktan sonra isteklerin ~%15–20'si **500** dönüyordu (şifre değiştirme dahil; panel "Şifre güncellenemedi" gösteriyordu). Temizlik çağrısı tüm sabitlerin altına taşındı.
- Bu hata statik kontrolde görünmediği için `api.php` artık PHP 8.3 (WebAssembly) üzerinde gerçek isteklerle test ediliyor: giriş/şifre, oda, öğe, parçalı yükleme/indirme, istatistik, ayarlar.
- Gizli dosyalar artık geçici dosyaya yazılıp yeniden adlandırılıyor; yazma başarısız olursa API gerçek sebebi (yol bilgisi olmadan) döndürüyor.

## Hâlâ açık kalan riskler / öneriler

1. **Oda kodu = tek gizli anahtar.** 4 karakter kısa; hız sınırı tarayıcı taramasını yavaşlatır ama dağıtık bir saldırganı durdurmaz. Öneri: otomatik kodları 6 karaktere çıkarmak veya isteğe bağlı oda PIN'i.
2. **Odadaki herkes her şeyi silebilir** (`destroy_room`, `clear_items`, `delete_item`) — tasarım gereği, ama oluşturan cihaza ait bir "sahip anahtarı" ile sınırlanabilir.
3. **Uçtan uca şifreleme yok.** Sunucu (ve hosting sağlayıcısı) içerikleri düz görür. İleride: oda anahtarı URL fragment'ında (`#key`) tutulup içerik tarayıcıda AES-GCM ile şifrelenebilir — sunucu hiç görmez.
4. **"Sıfır disk izi" iddiası PHP sürümü için doğru değil** — içerik `data/room_*.json` dosyalarında tutuluyor (süre dolunca siliniyor). Metinlerde (README / yasal uyarı) belirtilmeli.
5. **Her yoklamada (1,5 sn) tüm öğeler, görseller dahil, yeniden indiriliyor.** Bant genişliği ve mobil veri için `since=itemsModified` ile delta yanıt eklenmeli (Android uygulaması için de gerekli).
6. **CSP (Content-Security-Policy) yok.** Sayfada satır içi script ve `onerror` öznitelikleri olduğu için önce bunların dosyaya taşınması gerekiyor.
7. **Kök dizin ve `public/` aynı dosyaların iki kopyası.** Deploy `public/`'ten yapılıyor; kopyaların ayrışma riski var. Tek kaynak (sadece `public/`) önerilir.
8. Admin config yazımı, odalar ve oran sınırlayıcı dosyaları kilitsiz okuma-değiştirme-yazma yapıyor; yoğun eşzamanlı kullanımda veri kaybı olabilir (güvenlikten çok bütünlük konusu).

## Test edilenler

- Node backend yerelde: yanlış/varsayılan giriş, zorunlu şifre değişimi (403), URL'deki token'ın reddedilmesi, zayıf şifre / yanlış mevcut şifre, başarılı değişim, eski şifrenin reddi, 5 denemede kilit (429), oda üzerine yazma (409), zararlı görsel/renk enjeksiyonu (reddedildi/temizlendi), tarayıcıda XSS yüklerinin çalışmadığı.
- **PHP backend yerelde çalıştırılamadı** (makinede PHP yok); kod gözden geçirildi, aynı mantığı uyguluyor. Canlıya almadan önce bir test alt dizininde denenmesi önerilir.
