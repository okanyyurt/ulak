<div align="center">

# 🕊️ ULAK
### Cihazlar Arası Işık Hızında Geçici Pano & Canlı Veri Aktarım Sistemi
#### Fast, Ephemeral Cross-Device Clipboard & Real-Time LivePad

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Language](https://img.shields.io/badge/Language-TR%20%7C%20EN-blue.svg)](#-dil-desteği--multilingual-support)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PHP Ready](https://img.shields.io/badge/PHP-7.4%2B%20%2F%208.x-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![Docker Ready](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Zero Config](https://img.shields.io/badge/Setup-Zero%20Config-brightgreen)](#-kurulum-ve-kullanım-seçenekleri)
[![Self-Destruct](https://img.shields.io/badge/Privacy-Self--Destruct%20RAM-red)](#-gizlilik-ve-yasal-sorumluluk-reddi)

**Ulak**, telefonunuz, bilgisayarınız, tabletiniz ve diğer tüm cihazlarınız arasında **üyelik, kayıt veya uygulama yükleme gerektirmeden** saniyeler içinde metin, kod blokları, bağlantılar ve fotoğraflar paylaşmanızı sağlayan **%100 ücretsiz, iki dilli (Türkçe & English) ve açık kaynaklı** bir aktarım köprüsüdür.

[Özellikler](#-öne-çıkan-özellikler) • [Canlı Demo](#-canlı-demo--live-demo) • [Hemen Başla](#-hızlı-kullanım) • [Kurulum Seçenekleri](#-kurulum-ve-kullanım-seçenekleri) • [English Guide](#-english-documentation) • [Gizlilik](#-gizlilik-ve-yasal-sorumluluk-reddi) • [Lisans](#-lisans)

</div>

---

## 🌐 Canlı Demo / Live Demo

- **Demo Adresi:** [https://okanyesilyurt.com/c](https://okanyesilyurt.com/c)

> [!WARNING]
> **Kapasite ve Kaynak Uyarısı / Server Capacity Notice:**
> `https://okanyesilyurt.com/c` adresi kişisel bir vitrin ve canlı demo ortamıdır; sunucu imkanları yüksek küresel trafiği ve büyük dosya aktarımlarını kaldıracak kapasitede değildir.
> Lütfen sistemi düzenli, kişisel veya kurumsal kullanımlarınız için **kendi paylaşımlı hostinginize (PHP ile 1 dakikada sıfır ayar), kendi VPS'inize (Docker) veya ofis/ev içi yerel Wi-Fi ağınıza** ücretsiz kurunuz.
> 
> *The instance at `https://okanyesilyurt.com/c` is a personal showcase/demo with limited server capacity. For regular or high-volume usage, please deploy your own free instance on your shared web host (cPanel/PHP), VPS (Docker), or local Wi-Fi network.*

---

## 🌍 Dil Desteği / Multilingual Support
Ulak, tek tıkla diller arasında anında geçiş yapabileceğiniz dahili iki dilli (i18n) arayüze sahiptir:
- 🇹🇷 **Türkçe** (Varsayılan)
- 🇬🇧 **English** (Global)

Tarayıcınızın varsayılan diline göre otomatik başlar ve başlıktaki `🌐 EN` / `🌐 TR` butonuyla tek tıkla dil değiştirilebilir; seçiminiz tarayıcınızda hatırlanır.

---

## 💡 Ulak Nedir? Neden Doğdu?
Tarihte **Ulak**, acil ve kritik haberleri en kestirme yoldan, beklemeden yerine ulaştıran güvenilir habercidir.

Günümüzde iki cihaz arasında (örneğin telefonunuz ile bilgisayarınız arasında) anlık bir metin, link, şifre veya ekran görüntüsü aktarmak istediğinizde:
- Kendinize mesajlaşma uygulamalarından mesaj atmak,
- E-posta taslaklarına kaydetmek,
- Ya da karmaşık bulut uygulamalarına giriş yapmak zorunda kalırsınız.

**Ulak ile buna gerek yok!** 
Odayı açın (veya 4 karakterli kısa kodla katılın), QR kodu okutun ve verinizi anında diğer ekranda görün. İşiniz bittiğinde tüm veriler **otomatik olarak kendini imha eder** veya kırmızı butona basarak sunucu RAM'inden tamamen silebilirsiniz.

---

## ✨ Öne Çıkan Özellikler

### 💬 WhatsApp Tarzı Mesajlaşma & Cihaz Ayırt Etme
- **Kendi Cihazınız:** Sağ tarafa yaslı, parlak vurgulu mesaj balonları.
- **Diğer Bağlı Cihazlar:** Sol tarafa yaslı mesaj balonları.
- **Cihaz Adlandırma:** Cihazınıza tek tıkla dilediğiniz adı verin (örneğin *"Okan MacBook"*, *"Ofis PC"*, *"iPhone 15"*).
- **Otomatik Renk Rozetleri:** Her cihaza otomatik ve sabit bir renk kimliği atanır (zümrüt, ametist, sarı, cyan vb.), kimin ne yazdığı anında ayırt edilir.

### 💻 Akıllı Kod Algılama & Mini Kopyalama
- Paylaştığınız metin bir kod parçacığı (JavaScript, Python, PHP, HTML/CSS, SQL, JSON vb.) içeriyorsa **otomatik olarak algılanır**.
- Şık bir terminal/kod kutusu içine alınır, sözdizimi rozeti eklenir ve üzerinde **tek tıkla panoya kopyalama butonu** belirir.

### 📝 Canlı Ortak Not Defteri (LivePad) & Neon Yazar Vurgusu
- İki veya daha fazla cihaz aynı metin üzerinde canlı çalışabilir.
- Değişiklikler **harf harf eşzamanlanır**.
- Arka planda göz yormayan **zarif, silik neon vurgular** sayesinde hangi cümlenin veya karakterin hangi cihaz tarafından yazıldığı anında anlaşılır.

### 🖼️ Görsel ve Ekran Görüntüsü Aktarımı
- Bilgisayarınızda `Ctrl + V` yaparak panodaki ekran görüntüsünü anında yapıştırın.
- Mobilden galeriden görsel seçin veya kamera ile çekin.
- İstemci tarafında otomatik canvas optimizasyonu (sunucuyu veya mobil kotanızı yormaz).
- Dahili **Lightbox (Tam Ekran Önizleme)** ve doğrudan indirme butonu.

### 🔗 Kısa 4 Karakterli Oda Kodları
- Uzun ve karmaşık URL'ler yerine `1a23`, `a123`, `9z88` gibi sadece **4 karakterli** harf ve rakam kombinasyonuyla odaya katılabilirsiniz.
- Dileyen kullanıcılar özel uzun oda isimleri de belirleyebilir.

### 🔥 Kendini İmha (Self-Destruct / TTL)
- **Okunur Okunmaz (Burn on Read):** Diğer cihaz odaya katılıp içeriği gördükten 60 saniye sonra her şey silinir.
- **15 Dakika**, **1 Saat** (Varsayılan), **8 Saat** veya **24 Saat**.
- **Manuel Acil İmha:** Kırmızı *"İmha Et"* butonuyla anında sıfırlama.

### 🎛️ Yönetici Paneli (Admin Dashboard)
- **Erişim Adresi:** `/admin` (veya `admin.html`)
- **Varsayılan Giriş Bilgileri:**
  - **Kullanıcı Adı:** `admin`
  - **Şifre:** `admin`
- **Yönetim Özellikleri:**
  - Aktif tüm oturumları ve bağlı cihazları canlı listeleme.
  - Oturumların ve genel sistemin **kapladığı toplam RAM / bellek boyutunu** (B, KB, MB) görüntüleme.
  - İstenmeyen veya süresi geçmiş oturumları **tek tek silme**.
  - Çoklu seçim ile **toplu silme** (Batch Delete) veya tek tıkla tüm oturumları sıfırlama (Purge All).
  - Canlı otomatik yenileme (Auto-Refresh) ve hızlı oda arama/filtreleme.
  - Hem Node.js hem de PHP motorlarında sıfır konfigürasyonla tam uyumlu çalışma.

### 🛡️ Sıfır Disk İzi (Zero-Storage RAM)
- Veriler sunucu sabit diskine veya bir SQL veritabanına **asla kaydedilmez**.
- Her şey Node.js veya PHP oturum belleğinde (RAM) geçici olarak yaşar ve süre dolunca tamamen buharlaşır.

---

## 🚀 Hızlı Kullanım (Nasıl Kullanılır?)

1. **Oda Açın:**
   - Tarayıcınızdan Ulak'ı açın ve **"Yeni Paylaşım Oturumu Başlat"** butonuna tıklayın.
   - Size özel 4 karakterli bir kod (örn. `b7x2`) üretilir.
2. **Diğer Cihazı Bağlayın:**
   - **Yöntem A:** Ekrandaki **QR Kodu** telefonunuzun kamerasıyla taratın.
   - **Yöntem B:** Diğer cihazın tarayıcısına doğrudan linki yazın (örn. `siteniz.com/c/b7x2` veya yerel ağdaysanız `192.168.1.50:3000/b7x2`).
   - **Yöntem C:** Ulak ana sayfasındaki kutucuğa sadece `b7x2` yazıp **"Katıl"** deyin.
3. **Paylaşın ve Senkronize Olun:**
   - Metin yazın, kod yapıştırın veya görsel yükleyin. İki ekranda da saniyesinde görünür!

---

## 🛠️ Kurulum ve Kullanım Seçenekleri

Ulak, her türlü kullanım senaryosuna göre son derece esnek geliştirilmiştir:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ULAK KURULUM SEÇENEKLERİ                        │
├──────────────────┬──────────────────┬─────────────────┬────────────────┤
│ 1. Kendi Sitenize│ 2. Yerel Ağ /    │ 3. Docker /     │ 4. Production  │
│ (cPanel/Apache)  │ Wi-Fi (İnternet  │ VPS Sunucu      │ Node.js & PM2  │
│ PHP - Sıfır Ayar │ Olmasa da OK)    │ Tek Komutla     │ Nginx Proxy    │
└──────────────────┴──────────────────┴─────────────────┴────────────────┘
```

---

### Seçenek 1: Kendi Web Sitenize / Paylaşımlı Hosting'e Kurulum (PHP - SIFIR AYAR)
> **Node.js, SSH veya terminal çalıştırmanıza gerek yok!** Standart cPanel, DirectAdmin, Plesk, LiteSpeed veya Apache hostinginizde hemen çalışır.

1. Bu repoyu indirin (ZIP olarak veya `git clone`).
2. Sitenizin FTP'sine veya cPanel Dosya Yöneticisine girin.
3. Sitenizde istediğiniz bir klasör oluşturun (örneğin `public_html/c` veya `public_html/ulak`).
4. Klasörün içine şu dosyaları yükleyin:
   ```
   ├── api.php
   ├── index.php
   ├── app.js
   ├── style.css
   ├── qrcode.min.js
   ├── .htaccess
   └── assets/
   ```
5. **Bitti!** Artık `https://siteniz.com/c` adresinden dilediğiniz gibi kullanabilirsiniz.
   - MySQL veya herhangi bir veritabanı kurulumu gerekmez.
   - Ekstra kütüphane derleme gerekmez.

---

### Seçenek 2: Ev / Ofis Yerel Ağında (LAN / Wi-Fi) İnternetsiz Kullanım
> Bilgisayarınız ve telefonunuz aynı Wi-Fi ağına bağlıysa, verilerinizi harici hiçbir internet sunucusuna göndermeden doğrudan kendi yerel ağınızda ışık hızında aktarabilirsiniz!

#### A) Node.js ile Yerel Ağda Çalıştırma:
1. Bilgisayarınızda projeyi açın:
   ```bash
   npm install
   npm start
   ```
2. Terminalde yerel ağ IP adresiniz görüntülenir:
   ```
   🚀 Ulak sunucusu hazır!
   ➜ Yerel:     http://localhost:3000
   ➜ Yerel Ağ:  http://192.168.1.105:3000
   ```
3. Telefonunuzdan bilgisayarınızın yerel IP'sini açın veya ekrandaki QR kodu okutun.
4. Tamamen yerel ağınızda, sıfır gecikmeyle pano paylaşımının tadını çıkarın!

#### B) Tek Satır PHP ile Yerel Ağda Çalıştırma (Node.js Olmadan):
Bilgisayarınızda PHP yüklüyse terminalden sadece şunu yazın:
```bash
php -S 0.0.0.0:8080 -t public
```
Aynı ağdaki telefonunuzdan `http://BILGISAYAR_IP_ADRESI:8080` adresine girmeniz yeterlidir!

---

### Seçenek 3: Docker & Docker Compose ile Kendi VPS'inizde
Docker yüklü herhangi bir Linux sunucuda tek komutla ayağa kaldırın:

```bash
docker compose up -d
```
Sunucunuzun 3000 portunda (`http://sunucu-ip:3000`) anında yayına başlar.

---

### Seçenek 4: Node.js & PM2 ile Production Sunucu Kurulumu

1. Depoyu sunucunuza klonlayın:
   ```bash
   git clone https://github.com/okanyyurt/ulak.git
   cd ulak
   npm install --production
   ```
2. PM2 ile arka planda 7/24 çalıştırın:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "ulak"
   pm2 save
   pm2 startup
   ```

#### Nginx Reverse Proxy (WebSocket Destekli) Yapılandırması:
`/etc/nginx/sites-available/default` dosyanıza ekleyin:
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 🇬🇧 English Documentation

### 🌐 Live Showcase Demo & Capacity Warning
- **Live Demo Instance:** [https://okanyesilyurt.com/c](https://okanyesilyurt.com/c)

> [!WARNING]
> **Server Capacity & Usage Notice:**  
> The instance at `https://okanyesilyurt.com/c` is a personal showcase/demo hosted on limited private server hardware. It is **not designed or sized to handle global public traffic or heavy file uploads**.  
> If you plan to use Ulak regularly for personal, team, or production workflows, please **self-host your own free instance**:
> - **Shared Web Hosting (cPanel / Apache / LiteSpeed):** 1-minute zero-configuration setup using PHP (no Node.js required).
> - **Local Wi-Fi Network (LAN):** 100% offline & local data exchange with no external servers.
> - **Docker / VPS:** Deploy in 10 seconds via `docker compose up -d`.

### What is Ulak?
In history, an **Ulak** was an express courier entrusted with delivering critical messages swiftly and securely. 
Today, **Ulak** is a 100% free and open-source cross-device temporary clipboard and collaborative livepad that works seamlessly without accounts, apps, or databases.

### Key Highlights
- ⚡ **Zero Sign-Up:** Create a room in 1 second, join via 4-character codes (e.g. `1a23`) or QR code.
- 💬 **WhatsApp-Style Bubbles:** Your own device on the right, other devices on the left with distinct colors and device names.
- 💻 **Smart Code Snippet Detection:** Formats programming code into sleek terminal boxes with dedicated copy buttons.
- 📝 **LivePad Collaboration:** Real-time synchronized notepad with subtle neon author highlights.
- 🔥 **Self-Destruct (TTL):** Burn on read (60s), 15m, 1h, 8h, 24h, or instant manual purge.
- 🎛️ **Admin Dashboard (`/admin`):** Monitor active sessions, inspect RAM memory sizes, close/delete single or batch rooms (`admin`/`admin`).
- 🛡️ **Zero Disk Footprint:** RAM-only storage. Nothing is saved to disks or databases.

### Installation Options

#### 1. Zero-Setup PHP Shared Hosting (cPanel / Apache / LiteSpeed)
Upload `api.php`, `index.php`, `admin.html`, `app.js`, `style.css`, `qrcode.min.js`, `.htaccess`, and `assets/` to your web directory via FTP. No Node.js, no database required!

#### 2. Local Network (LAN / Wi-Fi) Sharing
If your devices are on the same Wi-Fi, run locally without exposing data to the public internet:
```bash
npm install && npm start
# or with PHP built-in server:
php -S 0.0.0.0:8080 -t public
```
Scan the on-screen QR code with your phone and start syncing!

#### 3. Docker Deployment
```bash
docker compose up -d
```

---

## 🧪 Testler ve Doğrulama

Çoklu cihaz senkronizasyonunu, bellek temizliğini ve oda sınırlarını test etmek için:

```bash
node test_sync.js
```

---

## 📁 Proje Dosya Yapısı

```
ulak/
├── server.js              # Node.js + Express + Socket.IO sunucusu (RAM yönetimi & Admin API)
├── package.json           # Proje ayarları ve scriptleri
├── test_sync.js           # Çoklu istemci senkronizasyon simülasyon testi
├── Dockerfile             # Docker imaj yapılandırması
├── docker-compose.yml     # Kolay Docker Compose dosyası
├── LICENSE                # MIT Açık Kaynak Lisansı
├── README.md              # Kapsamlı dökümantasyon (TR & EN)
├── .gitignore             # Git yok sayma kuralları
├── .htaccess              # Apache URL yönlendirmeleri (REST & kısa linkler)
├── api.php                # PHP REST/Polling arka plan motoru & Admin API
├── index.php              # PHP tabanlı tam fonksiyonel tek-dosya arayüzü
├── index.html             # Standart modern HTML5 arayüzü
├── admin.html             # Kapsamlı yönetici paneli (Oturum izleme, RAM boyutu & silme)
├── style.css              # Koyu cam (Glassmorphism) teması & WhatsApp mesaj balonları
├── app.js                 # Pano istemcisi, WebSocket/Polling köprüsü, kod renklendirme
├── qrcode.min.js          # Çevrimdışı QR kod oluşturucu
└── assets/
    └── favicon.svg        # Çift yönlü senkronizasyon okları vektörel simgesi
```

---

## 🛡️ Gizlilik ve Yasal Sorumluluk Reddi (Disclaimer)

Ulak, geçici veri aktarımı amacıyla tasarlanmış açık kaynaklı bir araçtır:

1. **Uçtan Uca Şifreleme Garantisi Yoktur:** Ulak, verileri sunucu geçici belleğinde (RAM) tutar. Banka şifreleri, kimlik bilgileri, kredi kartı numaraları gibi hassas ve kritik bilgilerin aktarılması tavsiye edilmez.
2. **Sıfır Sorumluluk:** Ulak üzerinden aktarılan verilerin üçüncü şahıslar tarafından ele geçirilmesi, ağ dinlemeleri (MITM), kaybolması veya imha edilememesinden doğabilecek doğrudan veya dolaylı hiçbir zarardan yazılım geliştiricileri ve site sahibi sorumlu tutulamaz.
3. **Yasalara Uygunluk:** Ulak üzerinden telif hakkı ihlali içeren, yasa dışı, zararlı veya suç teşkil eden içeriklerin paylaşılması kesinlikle yasaktır. Sistemde gerçekleşen paylaşımların tüm cezai ve hukuki sorumluluğu tamamen paylaşımı yapan kullanıcıya aittir.

---

## 📄 Lisans

Bu proje **[MIT Lisansı](LICENSE)** altında lisanslanmıştır. Tamamen ücretsizdir, ticari ve kişisel projelerinizde dilediğiniz gibi kullanabilir, özelleştirebilirsiniz.

---

<div align="center">
  Geliştirici: <b>Okan Yeşilyurt</b> • <a href="https://github.com/okanyyurt">@okanyyurt</a>
  <br>
  <i>"Işık hızında, güvenli ve iz bırakmayan haberleşme."</i>
</div>
