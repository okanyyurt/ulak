/**
 * Ulak — Universal Client Application Logic
 * Supports BOTH:
 * 1. Zero-Setup Shared Hosting (cPanel / FTP upload with api.php - NO Node.js required!)
 * 2. Node.js + Socket.IO servers (if running server.js)
 */

(function () {
  'use strict';

  // Application Base Path & URL calculation
  function getAppBase() {
    const htmlDir = document.documentElement.getAttribute('data-app-dir');
    if (typeof htmlDir === 'string' || typeof window.__APP_DIR__ === 'string') {
      const folder = typeof htmlDir === 'string' ? htmlDir : window.__APP_DIR__;
      return {
        path: folder,
        url: window.location.origin + (folder ? folder + '/' : '/')
      };
    }

    const pathname = window.location.pathname;
    const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

    let folder = '';
    if (segments.length >= 1 && (segments[0] === 'c' || segments[0] === 'chat')) {
      folder = '/' + segments[0];
    }

    return {
      path: folder,
      url: window.location.origin + (folder ? folder + '/' : '/')
    };
  }

  const APP_BASE = getAppBase();
  const BASE_PATH = APP_BASE.path; // e.g. "/c" or "/chat" or ""
  const BASE_URL = APP_BASE.url;   // e.g. "https://www.okanyesilyurt.com/c/"

  function getApiUrl(query) {
    return BASE_URL + 'api.php' + (query ? '?' + query : '');
  }
  const DEVICE_COLORS = [
    { id: 'emerald', name: 'Yeşil', accent: '#10b981' },
    { id: 'amber', name: 'Sarı', accent: '#f59e0b' },
    { id: 'cyan', name: 'Mavi', accent: '#06b6d4' },
    { id: 'purple', name: 'Mor', accent: '#a855f7' },
    { id: 'rose', name: 'Pembe', accent: '#f43f5e' },
    { id: 'indigo', name: 'İndigo', accent: '#6366f1' }
  ];

  function getDeviceColor(deviceId) {
    if (!deviceId) return DEVICE_COLORS[0];
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = (hash << 5) - hash + deviceId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % DEVICE_COLORS.length;
    return DEVICE_COLORS[idx];
  }

  function getStoredDeviceId() {
    let id = null;
    try { id = localStorage.getItem('ulak_dev_id') || localStorage.getItem('airclip_dev_id'); } catch (e) {}
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10);
      try { localStorage.setItem('ulak_dev_id', id); } catch (e) {}
    }
    return id;
  }

  function getStoredDeviceName() {
    let name = null;
    try { name = localStorage.getItem('ulak_dev_name') || localStorage.getItem('airclip_dev_name'); } catch (e) {}
    if (name && name.trim()) return name.trim();
    return getDeviceName();
  }

  const myDeviceId = getStoredDeviceId();
  let myDeviceName = getStoredDeviceName();
  const myDeviceColor = getDeviceColor(myDeviceId);

  // =============================================================
  // INTERNATIONALIZATION (i18n) SYSTEM
  // =============================================================
  const I18N = {
    tr: {
      lang_name: "TR",
      lang_flag: "🇹🇷",
      switch_btn: "EN 🇬🇧",
      switch_title: "Switch to English",
      badge_tag: "Hızlı & Geçici Pano",
      theme_btn: "Aydınlık Mod",
      theme_btn_light: "Aydınlık Mod",
      theme_btn_dark: "Karanlık Mod",
      theme_toggle_title: "Aydınlık / Karanlık Mod Değiştir",
      theme_switched_light: "Aydınlık Mod Açıldı ☀️",
      theme_switched_dark: "Karanlık Mod Açıldı 🌙",
      device_pill_title: "Cihaz adınızı değiştirmek için tıklayın",
      default_device_name: "Cihazım",
      landing_title_1: "Cihazlar Arasında",
      landing_title_2: "Işık Hızında",
      landing_title_3: "Paylaşın",
      landing_subtitle: "Üyelik yok, kayıt yok. Yazı, bağlantı ve fotoğrafları bilgisayarlarınız ve telefonunuz arasında anında eşitleyin.",
      create_card_title: "Yeni Paylaşım Oturumu",
      create_card_desc: "Geçici ve şifresiz bir pano açarak cihazlarınız arasında anında veri aktarın.",
      join_card_title: "Var Olan Odaya Katıl",
      join_card_desc: "Mevcut bir oturuma bağlanmak için 4 haneli kodu veya tam bağlantıyı girin.",
      join_input_label: "Oda Kodu veya Link:",
      join_hint_qr_title: "QR Kod ile Giriş",
      join_hint_qr_desc: "Kamerayı diğer ekrandaki QR koda tutarak şifresiz ve anında bağlanabilirsiniz.",
      join_hint_quick_title: "Kısa Link Desteği",
      join_hint_quick_desc: "Tarayıcı adres çubuğuna doğrudan <code>${host}/xxxx</code> yazarak da oturuma girebilirsiniz.",
      ttl_hint: "Süre bitiminde tüm veriler bellekten silinir",
      ttl_opt_burn: "Okunur Okunmaz",
      ttl_opt_burn_desc: "Görüldükten 60sn sonra",
      ttl_opt_15m: "15 Dakika",
      ttl_opt_15m_desc: "Hızlı transfer",
      ttl_opt_1h: "1 Saat",
      ttl_opt_1h_desc: "Önerilen",
      ttl_opt_8h: "8 Saat",
      ttl_opt_8h_desc: "Mesai süresince",
      ttl_opt_24h: "1 Gün",
      ttl_opt_24h_desc: "24 saat sakla",
      custom_room_label: "Özel Oda Adı (İsteğe Bağlı):",
      custom_room_placeholder: "İstediğiniz Adı Yazın (veya boş bırakın)",
      room_preview_note: "Bu odaya <code class=\"preview-url-badge\"><span class=\"preview-host\">${host}/</span><strong id=\"preview-custom-slug\" class=\"preview-slug\">xxxx</strong></code> olarak erişilebilecektir.",
      btn_create_room: "Hemen Oturumu Başlat",
      divider_or: "VEYA VAR OLAN BİR ODAYA GİRİN",
      join_input_placeholder: "Oda kodu veya tam link...",
      btn_join: "Katıl",
      feat_1_title: "Sıfır Disk İzi",
      feat_1_desc: "Hiçbir veri sunucu diskine yazılmaz. Yalnızca geçici RAM'de tutulur, süre dolunca buharlaşır.",
      feat_2_title: "Kısa Link & QR Kod",
      feat_2_desc: "Kamerayı QR koda tutun veya <code>${host}/xxxx</code> gibi kısa linkle anında aynı odaya bağlanın.",
      feat_3_title: "Gerçek Zamanlı Eşzamanlama",
      feat_3_desc: "Bir cihazdan eklenen metin, link veya fotoğraf diğer cihazlara anında yansır.",
      security_banner_text: "<strong>Önemli Yasal Bildirim:</strong> Ulak geçici ve deneysel bir anlık aktarım aracıdır. Uçtan uca mutlak gizlilik garanti edilmez. Şifre, kredi kartı veya özel/gizli bilgilerinizi kesinlikle paylaşmayınız. İllegal içerik paylaşımı kesinlikle yasaktır; tüm hukuki ve cezai sorumluluk kullanıcıya aittir.",
      btn_legal_terms: "Yasal Şartlar & Sorumluluk Reddi",
      footer_privacy: "Gizlilik Bildirimi",
      footer_terms: "Kullanım Şartları",
      footer_disclaimer: "Sorumluluk Reddi",
      footer_copy: "Ulak — RAM üzerinde çalışan geçici ve anlık veri aktarım servisi. Sunucuda kalıcı log tutulmaz.",
      room_label: "Oda:",
      btn_legal: "Yasal Uyarı",
      btn_qr: "QR Kod",
      btn_copy_link: "Linki Kopyala",
      btn_destroy: "İmha Et",
      tab_clips: "Pano & Fotoğraf Akışı",
      tab_livepad: "Canlı Ortak Not Defteri",
      live_sync_tag: "CANLI",
      composer_placeholder: "Yazı, link veya kod yapıştırın ya da yazın... (Ctrl+Enter ile gönder, Ctrl+V ile resim yapıştır)",
      btn_paste: "Panodan Yapıştır",
      btn_upload: "Fotoğraf Ekle",
      btn_upload_file: "Dosya Ekle",
      btn_send: "Gönder",
      composer_security_tip: "Önemli: Şifre, kredi kartı veya hassas kişisel bilgi paylaşmayınız. <a href=\"#\" id=\"link-composer-legal\">Yasal Uyarı & Gizlilik</a>",
      clips_section_title: "Paylaşılan Pano Öğeleri",
      btn_clear_all: "Tümünü Temizle",
      empty_clips_title: "Henüz bir öğe paylaşılmadı",
      empty_clips_desc: "Yukarıdaki alana bir metin yazın, \"Panodan Yapıştır\" butonuna basın veya resim ekleyin. Diğer cihazlarınız anında görecek.",
      livepad_title: "Ortak Anlık Not Defteri",
      livepad_desc: "Buraya yazılan her harf bağlı tüm cihazlarda canlı güncellenir. Gönder butonuna gerek yoktur.",
      livepad_copy: "Tümünü Kopyala",
      livepad_clear: "Temizle",
      livepad_legend: "Yazar İmzaları:",
      livepad_placeholder: "İki cihaz arasında canlı olarak paylaşmak istediğiniz metni buraya yazın veya yapıştırın...",
      modal_qr_title: "Cihaz Bağla & QR Kod",
      modal_qr_desc: "Diğer cihazınızın kamerasıyla bu QR kodu okutarak anında odaya girin:",
      lightbox_default_title: "Görsel",
      modal_destroy_title: "Oturumu Şimdi İmha Et?",
      modal_destroy_desc: "Bu işlem oturumdaki tüm metin ve görselleri <strong>sunucu belleğinden kalıcı olarak yok edecektir</strong>. Tüm cihazların bağlantısı kesilir.",
      btn_cancel: "Vazgeç",
      btn_confirm_destroy: "Evet, Tamamen İmha Et",
      destroyed_title: "Oturum Güvenle İmha Edildi",
      destroyed_reason_default: "Süre doldu veya imha edildi. Sunucu belleğindeki tüm veriler sıfırlandı.",
      btn_restart_app: "Yeni Bir Oturum Aç",
      modal_rename_title: "Cihaz Adınızı Belirleyin",
      modal_rename_desc: "Mesajlarınızın ve canlı notlarınızın karışmaması için bu cihaza bir isim verin (örn: MacBook, Ofis PC, iPhone):",
      modal_rename_placeholder: "Örn: MacBook, Ofis PC, iPhone...",
      btn_save: "Kaydet",
      legal_title: "Yasal Uyarı, Gizlilik & Sorumluluk Reddi",
      legal_accept_btn: "Şartları & Sorumluluk Reddini Okudum, Anladım",
      device_count_single: "1 Cihaz Bağlı",
      device_count_multi: "{n} Cihaz Bağlı",
      btn_copy_clip: "Kopyala",
      btn_copied: "Kopyalandı!",
      btn_download_img: "İndir",
      btn_delete_clip: "Sil",
      btn_open_url: "Yeni Sekmede Aç",
      hour_short: "s",
      min_short: "dk",
      toast_copied: "Panoya kopyalandı!",
      toast_copy_fail: "Kopyalama başarısız oldu.",
      toast_room_destroyed: "Oda başarıyla imha edildi.",
      toast_renamed: "Cihaz adı kaydedildi: ",
      toast_opt_image: "Görsel optimize ediliyor...",
      toast_clip_pasted: "Panodaki metin yapıştırıldı!",
      toast_clip_empty: "Pano boş.",
      toast_img_pasted: "Panodaki görsel eklendi!",
      toast_perm_denied: "Lütfen panoya erişim izni verin.",
      toast_connected: "Odaya bağlanıldı: ",
      toast_burn_started: "🔥 İkinci cihaz bağlandı! 60 saniye içinde kendini imha edecek.",
      toast_neon_on: "Yazar neon vurguları açıldı.",
      toast_neon_off: "Yazar neon vurguları gizlendi.",
      toast_download_started: "İndirme başlatıldı.",
      toast_room_code_copied: "Oda kodu panoya kopyalandı!",
      toast_link_copied: "Oda bağlantısı panoya kopyalandı!",
      livepad_highlight_on: "Vurgu: Açık",
      livepad_highlight_off: "Vurgu: Kapalı",
      modal_paste_title: "Panodan Yapıştır",
      modal_paste_desc: "Tarayıcı güvenlik kısıtlaması nedeniyle panoya doğrudan erişilemedi. Aşağıdaki kutucuğa tıklayıp <strong>Ctrl + V</strong> (Mac: <strong>Cmd + V</strong>) veya mobilde <strong>Yapıştır</strong> yapabilirsiniz:",
      modal_paste_zone_hint: "Buraya tıklayın ve Ctrl+V yapın",
      modal_paste_placeholder: "Panodakini buraya yapıştırın (Metin veya Görsel)...",
      footer_admin: "Yönetici"
    },
    en: {
      lang_name: "EN",
      lang_flag: "🇬🇧",
      switch_btn: "TR 🇹🇷",
      switch_title: "Türkçe'ye Geç",
      badge_tag: "Fast & Ephemeral Clipboard",
      theme_btn: "Light Mode",
      theme_btn_light: "Light Mode",
      theme_btn_dark: "Dark Mode",
      theme_toggle_title: "Toggle Light / Dark Mode",
      theme_switched_light: "Switched to Light Mode ☀️",
      theme_switched_dark: "Switched to Dark Mode 🌙",
      device_pill_title: "Click to rename this device",
      default_device_name: "My Device",
      landing_title_1: "Share Across Devices",
      landing_title_2: "At Lightning Speed",
      landing_title_3: "",
      landing_subtitle: "No sign-up, no login. Instant sync for text, links, code, and photos between your computers and phones.",
      create_card_title: "Start a New Sharing Room",
      create_card_desc: "Open a temporary, passwordless room to transfer data instantly between devices.",
      join_card_title: "Join Existing Room",
      join_card_desc: "Enter a 4-character code or full link to connect to an ongoing session.",
      join_input_label: "Room Code or Link:",
      join_hint_qr_title: "Instant QR Code Join",
      join_hint_qr_desc: "Scan the QR code displayed on the other screen with your camera to join directly.",
      join_hint_quick_title: "Direct URL Support",
      join_hint_quick_desc: "You can also type <code>${host}/xxxx</code> directly into your browser address bar.",
      ttl_hint: "All data will be permanently wiped when the timer expires",
      ttl_opt_burn: "Burn on Read",
      ttl_opt_burn_desc: "60s after viewed",
      ttl_opt_15m: "15 Minutes",
      ttl_opt_15m_desc: "Quick transfer",
      ttl_opt_1h: "1 Hour",
      ttl_opt_1h_desc: "Recommended",
      ttl_opt_8h: "8 Hours",
      ttl_opt_8h_desc: "Workday session",
      ttl_opt_24h: "1 Day",
      ttl_opt_24h_desc: "Keep for 24 hours",
      custom_room_label: "Custom Room Name (Optional):",
      custom_room_placeholder: "Type your custom name (or leave empty)",
      room_preview_note: "This room will be accessible at <code class=\"preview-url-badge\"><span class=\"preview-host\">${host}/</span><strong id=\"preview-custom-slug\" class=\"preview-slug\">xxxx</strong></code>.",
      btn_create_room: "Start Room & Generate QR",
      divider_or: "OR JOIN AN EXISTING ROOM",
      join_input_placeholder: "Room code or full link...",
      btn_join: "Join Room",
      feat_1_title: "Zero Disk Trace",
      feat_1_desc: "No data is written to server disk or database. Held strictly in temporary RAM and vaporized when expired.",
      feat_2_title: "Short Link & QR Code",
      feat_2_desc: "Scan the QR code with your camera or use a quick <code>${host}/xxxx</code> link to join the same room instantly.",
      feat_3_title: "Real-Time Sync",
      feat_3_desc: "Text, links, and photos added from one device appear on other connected screens in milliseconds.",
      security_banner_text: "<strong>Important Legal Notice:</strong> Ulak is a temporary, ephemeral data transfer tool. End-to-end encryption is not guaranteed. Do not share passwords, credit cards, or confidential private data. Illegal content is strictly forbidden; all legal liability rests solely with the user.",
      btn_legal_terms: "Legal Terms & Disclaimer",
      footer_privacy: "Privacy Notice",
      footer_terms: "Terms of Service",
      footer_disclaimer: "Disclaimer",
      footer_copy: "Ulak — Temporary in-memory cross-device clipboard service. Zero persistent server logging.",
      room_label: "Room:",
      btn_legal: "Legal Notice",
      btn_qr: "QR Code",
      btn_copy_link: "Copy Link",
      btn_destroy: "Self-Destruct",
      tab_clips: "Clipboard & Photo Stream",
      tab_livepad: "Collaborative LivePad",
      live_sync_tag: "LIVE",
      composer_placeholder: "Type or paste text, links, or code... (Ctrl+Enter to send, Ctrl+V to paste image)",
      btn_paste: "Paste Clipboard",
      btn_upload: "Add Photo",
      btn_upload_file: "Add File",
      btn_send: "Send",
      composer_security_tip: "Important: Never share passwords, credit cards, or sensitive data. <a href=\"#\" id=\"link-composer-legal\">Legal Notice & Privacy</a>",
      clips_section_title: "Shared Clipboard Items",
      btn_clear_all: "Clear All",
      empty_clips_title: "No clips shared yet",
      empty_clips_desc: "Type a message above, click \"Paste Clipboard\", or paste a screenshot. Connected devices will see it immediately.",
      livepad_title: "Collaborative Realtime Notepad",
      livepad_desc: "Every character typed here updates live across all connected devices. No submit button required.",
      livepad_copy: "Copy All",
      livepad_clear: "Clear",
      livepad_legend: "Author Colors:",
      livepad_placeholder: "Start typing notes to collaborate in real-time between your devices...",
      modal_qr_title: "Connect Device & QR Code",
      modal_qr_desc: "Scan this QR code with your phone camera to join this room instantly:",
      lightbox_default_title: "Image",
      modal_destroy_title: "Self-Destruct Room Now?",
      modal_destroy_desc: "This action will <strong>permanently purge all text, notes, and photos from server memory</strong>. All connected devices will be disconnected.",
      btn_cancel: "Cancel",
      btn_confirm_destroy: "Yes, Wipe Completely",
      destroyed_title: "Room Safely Self-Destructed",
      destroyed_reason_default: "Session expired or destroyed. All data in server memory has been cleared.",
      btn_restart_app: "Start a New Session",
      modal_rename_title: "Name This Device",
      modal_rename_desc: "Give this device a custom name so your messages and notes are clearly distinguishable (e.g. MacBook, Office PC, iPhone):",
      modal_rename_placeholder: "e.g. MacBook, Office PC, iPhone...",
      btn_save: "Save",
      legal_title: "Legal Notice, Privacy & Disclaimer",
      legal_accept_btn: "I Have Read & Agree to the Terms",
      device_count_single: "1 Device Connected",
      device_count_multi: "{n} Devices Connected",
      btn_copy_clip: "Copy",
      btn_copied: "Copied!",
      btn_download_img: "Download",
      btn_delete_clip: "Delete",
      btn_open_url: "Open in New Tab",
      hour_short: "h",
      min_short: "m",
      toast_copied: "Copied to clipboard!",
      toast_copy_fail: "Copy failed.",
      toast_room_destroyed: "Room has been destroyed.",
      toast_renamed: "Device name saved: ",
      toast_opt_image: "Optimizing image...",
      toast_clip_pasted: "Pasted from clipboard!",
      toast_clip_empty: "Clipboard is empty.",
      toast_img_pasted: "Pasted image from clipboard!",
      toast_perm_denied: "Please grant clipboard access permissions.",
      toast_connected: "Connected to room: ",
      toast_burn_started: "🔥 Second device joined! Room will self-destruct in 60 seconds.",
      toast_neon_on: "Author neon highlights enabled.",
      toast_neon_off: "Author neon highlights hidden.",
      toast_download_started: "Download started.",
      toast_room_code_copied: "Room code copied to clipboard!",
      toast_link_copied: "Room link copied to clipboard!",
      livepad_highlight_on: "Highlights: On",
      livepad_highlight_off: "Highlights: Off",
      modal_paste_title: "Paste from Clipboard",
      modal_paste_desc: "Browser security blocked automatic clipboard read. Please click the box below and press <strong>Ctrl + V</strong> (Mac: <strong>Cmd + V</strong>) or tap and <strong>Paste</strong> on mobile:",
      modal_paste_zone_hint: "Click here and press Ctrl+V",
      modal_paste_placeholder: "Paste clipboard content here (Text or Image)...",
      footer_admin: "Admin"
    }
  };

  const LEGAL_MODAL_HTML = {
    tr: `
      <div class="legal-section-callout" style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px 14px; border-radius: 4px; margin-bottom: 16px; color: #fca5a5;">
        <strong>⚠️ LÜTFEN DİKKATLE OKUYUNUZ:</strong> Bu servisi kullanarak aşağıdaki şartları ve yasal sorumluluk reddini peşinen, gayrikabili rücu kabul etmiş sayılırsınız.
      </div>

      <h4 style="color: var(--text-main); margin: 14px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>1.</span> Gizlilik Garantisi Verilmemektedir
      </h4>
      <p>
        Ulak, cihazlarınız arasında (telefon, bilgisayar vb.) pratik ve anlık veri aktarımı sağlamak amacıyla tasarlanmış açık bir web aracıdır. Sistem verileri geçici olarak sunucu belleğinde (RAM) tutsa ve süre bitiminde sıfırlasa dahi, <strong>uçtan uca şifreleme veya mutlak gizlilik garantisi verilmemektedir</strong>.
      </p>
      <p>
        Oda kodunu (örneğin <code>1a23</code>) veya doğrudan bağlantıyı bilen, tahmin eden, URL geçmişinden erişen ya da ortak ağları (halka açık Wi-Fi vb.) izleyen kötü niyetli üçüncü tarafların oturuma katılması teknik olarak mümkün olabilir.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>2.</span> Özel, Gizli ve Hassas Bilgi Paylaşımı Yasağı
      </h4>
      <p>
        Kullanıcıların bu platform üzerinden <strong>şifreler, e-posta/hesap giriş bilgileri, kredi kartı ve banka detayları, T.C. kimlik numaraları, ticari sırlar, özel yazışmalar ve her türlü hassas kişisel veri (KVKK kapsamındaki nitelikli veriler dahil) paylaşması KESİNLİKLE YASAKTIR VE ÖNERİLMEZ</strong>.
      </p>
      <p style="color: #f87171;">
        Bu tür hassas bilgilerin paylaşılması durumunda meydana gelebilecek herhangi bir yetkisiz erişim, sızıntı, kopyalanma, çalınma veya üçüncü şahısların eline geçmesi nedeniyle doğabilecek maddi, manevi, cezai veya hukuki hiçbir zarardan <strong>servis sağlayıcı, geliştirici ve site sahibi SORUMLU TUTULAMAZ</strong>. Tüm risk ve sorumluluk münhasıran kullanıcıya aittir.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>3.</span> Yasadışı İçerik Yasağı ve Hukuki Sorumluluk
      </h4>
      <p>
        Bu servis; Türkiye Cumhuriyeti Kanunları ve uluslararası mevzuat uyarınca suç teşkil eden, telif hakkı ihlali barındıran, müstehcen/yasadışı materyal, tehdit, hakaret, nefret söylemi, kişisel verileri ihlal eden veya zararlı yazılım/virüs dağıtımı içeren hiçbir içeriğin aktarımı için kullanılamaz.
      </p>
      <p>
        Sistem üzerinden paylaşılan her türlü metin, bağlantı ve dosyanın içeriğinden <strong>doğrudan ve yalnızca içeriği yükleyen/oluşturan kullanıcı sorumludur</strong>. Yetkili resmi makamlardan veya adli mercilerden talep gelmesi durumunda kanuni yükümlülükler eksiksiz yerine getirilir.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>4.</span> Hizmetin "Olduğu Gibi" (As-Is) Sunulması
      </h4>
      <p>
        Servis herhangi bir kesintisizlik, veri kurtarma veya doğruluk garantisi olmaksızın "olduğu gibi" sunulmaktadır. Süresi dolan veya imha edilen veriler kalıcı olarak yok edilir; silinen içeriklerin geri getirilmesi teknik olarak imkansızdır. Olası veri kayıplarından sistem sorumlu değildir.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>5.</span> Kayıtlar ve Kötüye Kullanım Bildirimi
      </h4>
      <p>
        Kötüye kullanımı önlemek ve yasal taleplere yanıt verebilmek için oda açma, paylaşım ve dosya yükleme işlemlerinde <strong>IP adresi, zaman, oda kodu ve dosyanın özeti (SHA-256)</strong> yönetici tarafından belirlenen süre boyunca (varsayılan 90 gün) kaydedilir. Paylaşılan içeriğin kendisi bu kayıtlarda tutulmaz.
      </p>
      <p>
        Uygunsuz veya yasa dışı bir içerik görürseniz odadaki <strong>"Bildir"</strong> düğmesini kullanın. Bildirilen odalar incelenip kapatılabilir; yetkili makamlardan talep gelmesi halinde kayıtlar mevzuata uygun şekilde paylaşılır.
      </p>
    `,
    en: `
      <div class="legal-section-callout" style="background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px 14px; border-radius: 4px; margin-bottom: 16px; color: #fca5a5;">
        <strong>⚠️ PLEASE READ CAREFULLY:</strong> By using this service, you irrevocably acknowledge and agree to the following terms and legal disclaimers.
      </div>

      <h4 style="color: var(--text-main); margin: 14px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>1.</span> No Warranty of Confidentiality or Encryption
      </h4>
      <p>
        Ulak is an open web tool engineered for quick, ephemeral transfer of text and media between your own devices. Although data resides temporarily in RAM and is wiped upon expiration, <strong>end-to-end encryption or absolute privacy is NOT guaranteed</strong>.
      </p>
      <p>
        Any malicious third party who knows, guesses, or intercepts the room code (e.g. <code>1a23</code>), or monitors unencrypted public Wi-Fi networks, may technically join the session.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>2.</span> Strict Prohibition of Confidential & Sensitive Information
      </h4>
      <p>
        Users are <strong>STRICTLY FORBIDDEN from sharing passwords, account credentials, credit card and banking details, government identification numbers, trade secrets, or sensitive personal data</strong> through this tool.
      </p>
      <p style="color: #f87171;">
        The service provider, developer, and website host <strong>SHALL NOT BE HELD LIABLE</strong> for any unauthorized access, interception, leak, theft, financial loss, or damages resulting from the transfer of confidential data. All risks rest solely on the user.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>3.</span> Prohibition of Unlawful Content & User Liability
      </h4>
      <p>
        This service must not be utilized to transmit content that violates local or international laws, infringes on copyrights, or contains obscene, defamatory, hateful, or malicious code/malware.
      </p>
      <p>
        The user who posts, transmits, or generates content via this service <strong>bears sole and exclusive civil and criminal liability</strong>. Full cooperation with judicial and administrative authorities will be provided upon legal demand.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>4.</span> "As-Is" Service & No Data Recovery
      </h4>
      <p>
        The service is provided strictly "as-is" without warranty of continuous availability, reliability, or recovery. Once expired or destroyed, all data is purged permanently from RAM with zero possibility of restoration.
      </p>

      <h4 style="color: var(--text-main); margin: 16px 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px;">
        <span>5.</span> Logs & Abuse Reports
      </h4>
      <p>
        To prevent abuse and to answer lawful requests, creating rooms, sharing and uploading files are logged with the <strong>IP address, time, room code and a file fingerprint (SHA-256)</strong> for a period set by the administrator (90 days by default). The shared content itself is not kept in these logs.
      </p>
      <p>
        If you see inappropriate or illegal content, use the <strong>"Report"</strong> button in the room. Reported rooms may be reviewed and closed; logs are disclosed to competent authorities only as required by law.
      </p>
    `
  };

  function getInitialLanguage() {
    try {
      const saved = localStorage.getItem('ulak_lang');
      if (saved === 'en' || saved === 'tr') return saved;
    } catch (e) {}
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('tr') ? 'tr' : 'en';
  }

  let currentLang = getInitialLanguage();

  function t(key, fallback) {
    if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
      return I18N[currentLang][key];
    }
    return fallback || key;
  }

  function applyLanguage(lang) {
    currentLang = lang;
    try { localStorage.setItem('ulak_lang', lang); } catch (e) {}
    document.documentElement.lang = lang;

    const dict = I18N[lang] || I18N.tr;

    // 1. Text Content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        el.textContent = dict[key];
      }
    });

    // 2. HTML Content
    const currentDisplayHost = (window.location.host + BASE_PATH).replace(/\/$/, '') || 'ulak.chat';
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (dict[key] !== undefined) {
        el.innerHTML = dict[key].replace(/\$\{host\}/g, currentDisplayHost);
      }
    });
    updateCustomSlugPreview();

    // 3. Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // 4. Titles / Tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key] !== undefined) {
        el.setAttribute('title', dict[key]);
      }
    });

    // 5. Update Toggle Buttons
    const landingToggle = document.getElementById('landing-lang-toggle');
    const roomToggle = document.getElementById('room-lang-toggle');
    const targetLabel = lang === 'tr' ? 'EN' : 'TR';
    const targetFlag = lang === 'tr' ? '🇬🇧' : '🇹🇷';
    const switchTitle = lang === 'tr' ? 'Switch to English' : "Türkçe'ye Geç";

    const landingText = document.getElementById('landing-lang-text');
    const landingFlag = document.getElementById('landing-lang-flag');
    if (landingText) landingText.textContent = targetLabel;
    if (landingFlag) landingFlag.textContent = targetFlag;
    if (landingToggle) landingToggle.title = switchTitle;

    const roomText = document.getElementById('room-lang-text');
    const roomFlag = document.getElementById('room-lang-flag');
    if (roomText) roomText.textContent = targetLabel;
    if (roomFlag) roomFlag.textContent = targetFlag;
    if (roomToggle) roomToggle.title = switchTitle;

    // 6. Update Legal Modal Body
    const legalBody = document.getElementById('legal-modal-body');
    if (legalBody && LEGAL_MODAL_HTML[lang]) {
      legalBody.innerHTML = LEGAL_MODAL_HTML[lang];
    }

    // 7. Update Livepad stats
    if (typeof updateLivepadStats === 'function') {
      updateLivepadStats();
    }
    if (typeof neonToggleText !== 'undefined' && neonToggleText) {
      neonToggleText.textContent = isNeonHighlighterActive ? dict.livepad_highlight_on : dict.livepad_highlight_off;
    }
  }

  function toggleLanguage() {
    const nextLang = currentLang === 'tr' ? 'en' : 'tr';
    applyLanguage(nextLang);
    
    // Update Theme Toggle Buttons labels
    const isLightNow = currentTheme === 'light';
    const themeTextKey = isLightNow ? 'theme_btn_dark' : 'theme_btn_light';
    const landingThemeText = document.getElementById('landing-theme-text');
    if (landingThemeText) landingThemeText.textContent = dict[themeTextKey] || (isLightNow ? 'Karanlık Mod' : 'Aydınlık Mod');
    const themeSwitchTitle = dict.theme_toggle_title || 'Aydınlık / Karanlık Mod Değiştir';
    const landingThemeToggleEl = document.getElementById('landing-theme-toggle');
    const roomThemeToggleEl = document.getElementById('room-theme-toggle');
    if (landingThemeToggleEl) landingThemeToggleEl.title = themeSwitchTitle;
    if (roomThemeToggleEl) roomThemeToggleEl.title = themeSwitchTitle;

    showToast(nextLang === 'en' ? 'Language switched to English 🇬🇧' : 'Dil Türkçe olarak ayarlandı 🇹🇷');
  }



  // =============================================================
  // THEME SYSTEM (Auto System Detection + Reactive OS sync + Manual Persistence)
  // =============================================================
  function getSystemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }

  function getInitialTheme() {
    try {
      const saved = localStorage.getItem('ulak_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return getSystemTheme();
  }

  let currentTheme = getInitialTheme();

  function applyTheme(theme, saveToStorage = true) {
    currentTheme = theme;
    if (saveToStorage) {
      try { localStorage.setItem('ulak_theme', theme); } catch (e) {}
    }
    document.documentElement.setAttribute('data-theme', theme);

    const isLight = theme === 'light';
    const icon = isLight ? '🌙' : '☀️';
    const textKey = isLight ? 'theme_btn_dark' : 'theme_btn_light';
    const label = t(textKey, isLight ? 'Karanlık Mod' : 'Aydınlık Mod');
    const switchTitle = t('theme_toggle_title', 'Aydınlık / Karanlık Mod Değiştir');

    const landingIcon = document.getElementById('landing-theme-icon');
    const landingText = document.getElementById('landing-theme-text');
    const landingToggle = document.getElementById('landing-theme-toggle');
    const roomIcon = document.getElementById('room-theme-icon');
    const roomToggle = document.getElementById('room-theme-toggle');

    if (landingIcon) landingIcon.textContent = icon;
    if (landingText) landingText.textContent = label;
    if (landingToggle) landingToggle.title = switchTitle;
    if (roomIcon) roomIcon.textContent = icon;
    if (roomToggle) roomToggle.title = switchTitle;
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme, true);
    const toastMsg = nextTheme === 'light'
      ? t('theme_switched_light', 'Aydınlık Mod Açıldı ☀️')
      : t('theme_switched_dark', 'Karanlık Mod Açıldı 🌙');
    showToast(toastMsg);
  }

  // Early theme initialization (respects saved preference or follows system)
  applyTheme(currentTheme, false);

  // Listen to OS system theme changes dynamically if user hasn't set an explicit manual preference
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        try {
          if (!localStorage.getItem('ulak_theme')) {
            applyTheme(e.matches ? 'light' : 'dark', false);
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  // State
  let currentRoomId = null;
  let currentTtlMode = '1h';
  let roomExpiresAt = null;
  let countdownTimerInterval = null;
  let lanHostUrl = null;
  let pendingImageBase64 = null;
  let pendingImageFile = null;
  let isTypingInLivePad = false;
  let livePadDebounceTimeout = null;
  let lastServerModified = 0;
  let lastServerItemsModified = 0;
  let lastRenderedClipsSignature = '';
  let lastLocalPadChangeTime = 0;
  let phpPollInterval = null;
  let socket = null;
  let engineType = 'php'; // 'php' or 'socket'

  // DOM Elements
  const landingView = document.getElementById('landing-view');
  const roomView = document.getElementById('room-view');
  const ttlSelector = document.getElementById('ttl-selector');
  const customRoomInput = document.getElementById('custom-room-input');
  const roomPrefixLabel = document.getElementById('room-prefix-label');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const formJoinRoom = document.getElementById('form-join-room');
  const joinRoomInput = document.getElementById('join-room-input');

  // Room Header Elements
  const currentRoomNameEl = document.getElementById('current-room-name');
  const roomIdBadge = document.getElementById('room-id-badge');
  const deviceCountText = document.getElementById('device-count-text');
  const ttlTimerBadge = document.getElementById('ttl-timer-badge');
  const ttlCountdownText = document.getElementById('ttl-countdown-text');
  const btnShowQr = document.getElementById('btn-show-qr');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnPromptDestroy = document.getElementById('btn-prompt-destroy');

  // Tab Elements
  const tabClipsBtn = document.getElementById('tab-clips-btn');
  const tabLivepadBtn = document.getElementById('tab-livepad-btn');
  const tabClipsContent = document.getElementById('tab-clips-content');
  const tabLivepadContent = document.getElementById('tab-livepad-content');
  const clipsCounter = document.getElementById('clips-counter');

  // Composer Elements
  const composerText = document.getElementById('composer-text');
  const composerImgPreview = document.getElementById('composer-img-preview');
  const previewImgTag = document.getElementById('preview-img-tag');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const btnCancelPreview = document.getElementById('btn-cancel-preview');
  const btnQuickPaste = document.getElementById('btn-quick-paste');
  const imageUploadInput = document.getElementById('image-upload-input');
  const btnSendClip = document.getElementById('btn-send-clip');
  const clipsContainer = document.getElementById('clips-container');
  const emptyClipsPlaceholder = document.getElementById('empty-clips-placeholder');
  const btnClearAll = document.getElementById('btn-clear-all');

  // Live Notepad Elements
  const livepadTextarea = document.getElementById('livepad-textarea');
  const livepadCharCount = document.getElementById('livepad-char-count');
  const livepadSyncStatus = document.getElementById('livepad-sync-status');
  const btnLivepadCopy = document.getElementById('btn-livepad-copy');
  const btnLivepadPaste = document.getElementById('btn-livepad-paste');
  const btnLivepadClear = document.getElementById('btn-livepad-clear');

  // Modals & Overlays
  const qrModal = document.getElementById('qr-modal');
  const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
  const qrCanvasHolder = document.getElementById('qr-canvas-holder');
  const modalRoomUrl = document.getElementById('modal-room-url');
  const btnModalCopyLink = document.getElementById('btn-modal-copy-link');
  const btnNativeShare = document.getElementById('btn-native-share');
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxFilename = document.getElementById('lightbox-filename');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const btnLightboxDownload = document.getElementById('btn-lightbox-download');
  const destroyConfirmModal = document.getElementById('destroy-confirm-modal');
  const btnCancelDestroy = document.getElementById('btn-cancel-destroy');

  // Quick Paste Dropzone Modal
  const quickPasteModal = document.getElementById('quick-paste-modal');
  const btnClosePasteModal = document.getElementById('btn-close-paste-modal');
  const btnCancelPasteModal = document.getElementById('btn-cancel-paste-modal');
  const quickPasteZone = document.getElementById('quick-paste-zone');
  const quickPasteInput = document.getElementById('quick-paste-input');
  const btnConfirmDestroy = document.getElementById('btn-confirm-destroy');
  const destroyedScreen = document.getElementById('destroyed-screen');
  const destroyedReasonText = document.getElementById('destroyed-reason-text');
  const btnRestartApp = document.getElementById('btn-restart-app');
  const toastContainer = document.getElementById('toast-container');

  // Device Header & Modal Elements
  const btnDeviceName = document.getElementById('btn-device-name');
  const headerDeviceName = document.getElementById('header-device-name');
  const headerDeviceDot = document.getElementById('header-device-dot');
  const deviceRenameModal = document.getElementById('device-rename-modal');
  const deviceRenameInput = document.getElementById('device-rename-input');
  const btnCloseDeviceModal = document.getElementById('btn-close-device-modal');
  const btnCancelDeviceRename = document.getElementById('btn-cancel-device-rename');
  const btnSaveDeviceRename = document.getElementById('btn-save-device-rename');

  
  const landingLangToggle = document.getElementById('landing-lang-toggle');
  const roomLangToggle = document.getElementById('room-lang-toggle');
  if (landingLangToggle) landingLangToggle.addEventListener('click', toggleLanguage);
  if (roomLangToggle) roomLangToggle.addEventListener('click', toggleLanguage);
  const landingThemeToggle = document.getElementById('landing-theme-toggle');
  const roomThemeToggle = document.getElementById('room-theme-toggle');
  if (landingThemeToggle) landingThemeToggle.addEventListener('click', toggleTheme);
  if (roomThemeToggle) roomThemeToggle.addEventListener('click', toggleTheme);

    
  // Livepad Overlay & Neon Highlights Elements
  const livepadBackdrop = document.getElementById('livepad-backdrop');
  const livepadHighlights = document.getElementById('livepad-highlights');
  const livepadAuthorsChips = document.getElementById('livepad-authors-chips');
  const btnToggleNeonHighlighter = document.getElementById('btn-toggle-neon-highlighter');
  const neonToggleText = document.getElementById('neon-toggle-text');
  let currentLivepadChunks = [];
  let isNeonHighlighterActive = true;

  // Update room prefix label
  if (roomPrefixLabel) {
    roomPrefixLabel.textContent = `${window.location.host}${BASE_PATH}/`;
  }

  // Live Room Slug Preview in Landing View
  const displayHostStr = (window.location.host + BASE_PATH).replace(/\/$/, '') || 'ulak.chat';
  document.querySelectorAll('.preview-host').forEach(el => {
    el.textContent = `${displayHostStr}/`;
  });
  document.querySelectorAll('.dynamic-domain-xxxx').forEach(el => {
    el.textContent = `${displayHostStr}/xxxx`;
  });

  function updateCustomSlugPreview() {
    const slugEl = document.getElementById('preview-custom-slug');
    const hostEl = document.querySelector('.preview-host');
    const curHost = (window.location.host + BASE_PATH).replace(/\/$/, '') || 'ulak.chat';
    if (hostEl) {
      hostEl.textContent = `${curHost}/`;
    }
    if (!slugEl) return;
    const inputEl = document.getElementById('custom-room-input');
    const rawVal = inputEl ? inputEl.value.trim() : '';
    if (rawVal) {
      const cleanSlug = rawVal.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase() || rawVal;
      slugEl.textContent = cleanSlug;
      slugEl.classList.add('custom-active');
    } else {
      slugEl.textContent = 'xxxx';
      slugEl.classList.remove('custom-active');
    }
  }

  if (customRoomInput) {
    customRoomInput.addEventListener('input', updateCustomSlugPreview);
    customRoomInput.addEventListener('keyup', updateCustomSlugPreview);
  }


  function getDeviceName() {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const platform = isMobile ? 'Mobil' : 'Masaüstü';
    return `${platform} (${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Tarayıcı'})`;
  }


  // =============================================================
  // LIVE PAD CHUNKS & NEON AUTHOR HIGHLIGHTS
  // =============================================================

  function sliceChunks(chunks, start, end) {
    if (start >= end) return [];
    const result = [];
    let curPos = 0;

    for (const chunk of chunks) {
      const chunkStart = curPos;
      const chunkEnd = curPos + chunk.t.length;
      curPos = chunkEnd;

      if (chunkEnd <= start || chunkStart >= end) {
        continue;
      }

      const sliceStart = Math.max(0, start - chunkStart);
      const sliceEnd = Math.min(chunk.t.length, end - chunkStart);
      const subText = chunk.t.slice(sliceStart, sliceEnd);
      if (subText) {
        result.push({
          t: subText,
          dev: chunk.dev,
          name: chunk.name,
          color: chunk.color
        });
      }
    }
    return result;
  }

  function mergeChunks(chunks) {
    const merged = [];
    for (const c of chunks) {
      if (!c.t) continue;
      const last = merged[merged.length - 1];
      if (last && last.dev === c.dev && last.color === c.color) {
        last.t += c.t;
      } else {
        merged.push({ ...c });
      }
    }
    return merged;
  }

  function computeUpdatedChunks(prevChunks, newText, authorDev, authorName, authorColor) {
    if (!newText) return [];
    if (!prevChunks || prevChunks.length === 0) {
      return [{ t: newText, dev: authorDev, name: authorName, color: authorColor }];
    }

    const oldText = prevChunks.map(c => c.t).join('');
    if (oldText === newText) return prevChunks;

    let prefixLen = 0;
    const maxPrefix = Math.min(oldText.length, newText.length);
    while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let suffixLen = 0;
    const maxSuffix = Math.min(oldText.length - prefixLen, newText.length - prefixLen);
    while (suffixLen < maxSuffix && oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]) {
      suffixLen++;
    }

    const insertedText = newText.slice(prefixLen, newText.length - suffixLen);
    const prefixChunks = sliceChunks(prevChunks, 0, prefixLen);
    const suffixChunks = sliceChunks(prevChunks, oldText.length - suffixLen, oldText.length);

    const res = [...prefixChunks];
    if (insertedText.length > 0) {
      res.push({
        t: insertedText,
        dev: authorDev,
        name: authorName,
        color: authorColor
      });
    }
    res.push(...suffixChunks);
    return mergeChunks(res);
  }

  function renderLivepadHighlights(chunks) {
    if (!livepadHighlights) return;
    if (!chunks || chunks.length === 0) {
      livepadHighlights.innerHTML = '';
      updateAuthorsLegend([]);
      return;
    }

    const html = chunks.map(chunk => {
      const colorId = safeColorId(chunk.color);
      const cleanText = escapeHtml(chunk.t);
      return `<span class="neon-chunk neon-chunk-${colorId}" title="Yazan: ${escapeHtml(chunk.name || 'Cihaz')}">${cleanText}</span>`;
    }).join('');

    livepadHighlights.innerHTML = html + '<br>';
    updateAuthorsLegend(chunks);
  }

  function updateAuthorsLegend(chunks) {
    if (!livepadAuthorsChips) return;
    const authorMap = new Map();

    authorMap.set(myDeviceId, {
      dev: myDeviceId,
      name: `${myDeviceName} (Sen)`,
      color: myDeviceColor.id
    });

    if (chunks && Array.isArray(chunks)) {
      for (const c of chunks) {
        if (c.dev && c.dev !== myDeviceId && !authorMap.has(c.dev)) {
          const col = c.color || getDeviceColor(c.dev).id;
          authorMap.set(c.dev, {
            dev: c.dev,
            name: c.name || 'Diğer Cihaz',
            color: col
          });
        }
      }
    }

    livepadAuthorsChips.innerHTML = Array.from(authorMap.values()).map(a => {
      const isMe = a.dev === myDeviceId;
      const extraClass = isMe ? ' device-pill my-device-chip' : '';
      const extraTitle = isMe ? ' title="Cihaz adınızı değiştirmek için tıklayın"' : '';
      return `<span class="legend-chip chip-${safeColorId(a.color)}${extraClass}"${extraTitle} style="${isMe ? 'cursor: pointer;' : ''}">● ${escapeHtml(a.name)}${isMe ? ' ✏️' : ''}</span>`;
    }).join('');
  }

  function syncLivepadScroll() {
    if (livepadBackdrop && livepadTextarea) {
      livepadBackdrop.scrollTop = livepadTextarea.scrollTop;
      livepadBackdrop.scrollLeft = livepadTextarea.scrollLeft;
    }
  }

  function updateDeviceHeaderBadge() {
    const allDeviceNames = document.querySelectorAll('#header-device-name, .header-device-name, .device-pill-name, #landing-device-name-text');
    allDeviceNames.forEach(el => { el.textContent = myDeviceName; });

    const allDeviceDots = document.querySelectorAll('#header-device-dot, .header-device-dot, .device-dot-indicator, #landing-device-dot');
    allDeviceDots.forEach(el => {
      el.style.background = myDeviceColor.accent;
      el.style.boxShadow = `0 0 6px ${myDeviceColor.accent}`;
    });

    updateAuthorsLegend(currentLivepadChunks);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Shared items come from other devices: only render real base64 image data URLs
  function isSafeImageDataUrl(value) {
    return typeof value === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }

  // Color ids are interpolated into CSS class names
  function safeColorId(value) {
    return DEVICE_COLORS.some(c => c.id === value) ? value : 'cyan';
  }

  const LANG_HEADER_REGEX = /^\s*(?:(?:Copy(?:\s+code)?|Kopyala)\s+)?(bash|shell|sh|zsh|terminal|powershell|ps1|cmd|command\s+prompt|python|py|javascript|js|typescript|ts|html|css|json|sql|php|c|cpp|c\+\+|c#|csharp|go|golang|rust|ruby|swift|kotlin|yaml|yml|xml|dockerfile|makefile)\s*$/i;

  const CLI_CMD_LIST = [
    // Packages & OS
    'sudo', 'apt', 'apt-get', 'aptitude', 'dpkg', 'pacman', 'yum', 'dnf', 'zypper', 'apk', 'snap', 'flatpak', 'brew', 'port',
    // Disks & Boot
    'mount', 'umount', 'chroot', 'grub-install', 'grub2-install', 'update-grub', 'update-grub2', 'grub-mkconfig', 'bootctl', 'efibootmgr',
    'fdisk', 'cfdisk', 'gdisk', 'parted', 'gparted', 'lsblk', 'blkid', 'mkfs', 'mkfs\\.ext[234]', 'mkfs\\.vfat', 'mkfs\\.ntfs', 'fsck', 'e2fsck', 'dd',
    // System & Services
    'systemctl', 'journalctl', 'service', 'crontab', 'ps', 'top', 'htop', 'btop', 'kill', 'killall', 'pkill', 'pgrep', 'nohup',
    // Files & Directories
    'cd', 'pwd', 'ls', 'll', 'la', 'dir', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch', 'ln', 'chmod', 'chown', 'chgrp',
    // Text & Search
    'cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'wc', 'tr', 'diff', 'patch', 'tee', 'xargs', 'find', 'which', 'whereis',
    // Shell built-ins & environment
    'echo', 'printf', 'read', 'export', 'source', 'alias', 'unalias', 'set', 'unset', 'env', 'history', 'clear', 'reset', 'exit', 'logout', 'reboot', 'shutdown', 'poweroff',
    // Network
    'ip', 'ifconfig', 'netstat', 'ss', 'ping', 'ping6', 'traceroute', 'tracepath', 'dig', 'nslookup', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ufw', 'iptables', 'ssh-keygen',
    // Hardware & Kernel
    'df', 'du', 'free', 'uptime', 'uname', 'dmesg', 'lspci', 'lsusb', 'modprobe', 'insmod', 'rmmod', 'lsmod',
    // Dev & Runtimes
    'git', 'docker', 'docker-compose', 'podman', 'kubectl', 'helm',
    'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno', 'node', 'nodemon',
    'pip', 'pip3', 'python', 'python3', 'py', 'composer', 'php', 'artisan', 'cargo', 'rustc', 'go', 'dotnet', 'mvn', 'gradle', 'make',
    'nano', 'vim', 'vi', 'nvim', 'code'
  ].join('|');

  const CLI_REGEX = new RegExp(`^(\\$|#|>|\\./)?\\s*(${CLI_CMD_LIST})($|\\s+.*)$`, 'i');

  function isShellConstruct(line) {
    const t = (line || '').trim();
    if (!t) return false;
    if (/^(for\s+[a-zA-Z0-9_]+\s+in\s+|while\s+|until\s+|if\s+\[|case\s+)/i.test(t)) return true;
    if (/^(do|done|then|else|elif|fi|esac)$/i.test(t)) return true;
    if (/^(export\s+)?[A-Z_][A-Z0-9_]*=/.test(t)) return true;
    return false;
  }

  function isCommandLine(line) {
    const t = (line || '').trim();
    if (!t) return false;
    if (isShellConstruct(t)) return true;
    const stripped = t.replace(/^[\$#>]\s*/, '');
    return CLI_REGEX.test(stripped);
  }

  function isCodeLineForLang(line, lang, prevLineEndedContinuation = false) {
    const t = (line || '').trim();
    if (!t) return false;

    // Narrative notes and sections to exclude
    if (t.startsWith('(') && (t.endsWith(')') || t.endsWith(').'))) return false;
    if (/^(adım|step|bölüm|not|note|warning|uyarı|ipucu|tip)\s*\d*[:\-.]/i.test(t)) return false;

    const upperLang = (lang || '').toUpperCase();

    // Bash / Shell CLI
    if (!upperLang || ['BASH', 'SHELL', 'SH', 'ZSH', 'TERMINAL', 'POWERSHELL', 'PS1', 'CMD', 'COMMAND PROMPT'].includes(upperLang)) {
      if (isCommandLine(t) || isShellConstruct(t)) return true;
      if (/^[\$#>]\s+[a-zA-Z0-9_\-\.\/]+/.test(t)) return true;
      if (prevLineEndedContinuation) return true;
      if (/^(--[a-zA-Z0-9_\-]+|-[a-zA-Z0-9]+)/.test(t)) return true;
      if (/^#\s+.*$/.test(t)) return true;
      if (/^[A-Za-z_][A-Za-z0-9_]*=[^\s]+/.test(t)) return true;
    }

    // Python
    if (upperLang === 'PYTHON' || upperLang === 'PY') {
      if (/^(def\s+|class\s+|import\s+|from\s+|if\s+|elif\s+|else:|while\s+|for\s+|try:|except.*:|finally:|return\b|print\(|yield\b|raise\b|with\s+|@|#)/.test(t)) return true;
      if (line.startsWith('    ') || line.startsWith('\t')) return true;
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.+/.test(t)) return true;
    }

    // JS / TS
    if (['JAVASCRIPT', 'JS', 'TYPESCRIPT', 'TS', 'NODE'].includes(upperLang)) {
      if (/^(const\s+|let\s+|var\s+|function\b|class\b|import\s+|export\s+|return\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(|\/\/|\/\*|\*|console\.)/.test(t)) return true;
      if (line.startsWith('  ') || line.startsWith('\t')) return true;
      if (t.endsWith(';') || t.endsWith('{') || t.endsWith('}') || t.includes('=>')) return true;
    }

    // JSON
    if (upperLang === 'JSON') {
      if (/^(\{|\}|\[|\]|".*"\s*:\s*.*,?)$/.test(t)) return true;
    }

    // SQL
    if (upperLang === 'SQL') {
      if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i.test(t)) return true;
    }

    // PHP
    if (upperLang === 'PHP') {
      if (/^(<\?php|\$[a-zA-Z0-9_]+|function\s+|class\s+|namespace\s+|use\s+|echo\s+|return\s+)/.test(t)) return true;
    }

    // General code markers
    if (upperLang && upperLang !== 'BASH') {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(.*\)\s*[{;]?$/.test(t)) return true;
      if (/^[{}[\]();,]+$/.test(t)) return true;
      if (line.startsWith('  ') || line.startsWith('\t')) return true;
    }

    return false;
  }

  function looksLikeRawCode(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes(':')) return 'JSON';
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'JSON';
    if (trimmed.startsWith('<?php')) return 'PHP';
    if (/^(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\s+/i.test(trimmed)) return 'SQL';
    if (/^<!DOCTYPE\s+html|<html[\s>]|<svg[\s>]/i.test(trimmed)) return 'HTML';
    if (/^(const|let|var|function|import|export|class)\s+[a-zA-Z0-9_$]+/m.test(trimmed) && (trimmed.includes(';') || trimmed.includes('{'))) return 'JAVASCRIPT';
    if (/^(def\s+[a-zA-Z0-9_$]+\s*\(|from\s+[a-zA-Z0-9_.]+\s+import|import\s+[a-zA-Z0-9_]+)/m.test(trimmed)) return 'PYTHON';
    return null;
  }

  function preProcessAutoCodeBlocks(rawText) {
    if (!rawText) return '';
    if (rawText.includes('```')) return rawText;

    const rawLang = looksLikeRawCode(rawText);
    if (rawLang) {
      return '```' + rawLang + '\n' + rawText.trim() + '\n```';
    }

    const lines = rawText.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check if line is a language header like "Bash", "Python", "JavaScript"
      const langMatch = trimmed.match(LANG_HEADER_REGEX);
      if (langMatch) {
        const detectedLang = langMatch[1].toUpperCase();
        let j = i + 1;
        const codeBuffer = [];
        let prevContinuation = false;

        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();

          // Empty line handling
          if (!nextTrimmed) {
            if (codeBuffer.length > 0 && j + 1 < lines.length) {
              const peekTrimmed = lines[j + 1].trim();
              if (isCodeLineForLang(peekTrimmed, detectedLang, false)) {
                codeBuffer.push(nextLine);
                j++;
                continue;
              }
            }
            break;
          }

          // If nextLine is another language header, stop this block
          if (LANG_HEADER_REGEX.test(nextTrimmed)) {
            break;
          }

          if (isCodeLineForLang(nextLine, detectedLang, prevContinuation)) {
            codeBuffer.push(nextLine);
            prevContinuation = nextTrimmed.endsWith('\\') || nextTrimmed.endsWith('|') || nextTrimmed.endsWith('&&');
            j++;
          } else {
            break;
          }
        }

        if (codeBuffer.length > 0) {
          result.push('```' + detectedLang + '\n' + codeBuffer.join('\n').trim() + '\n```');
          i = j;
          continue;
        }
      }

      // Normal command line sequence (without language header)
      if (isCodeLineForLang(trimmed, 'BASH', false)) {
        const codeBuffer = [line];
        let prevContinuation = trimmed.endsWith('\\') || trimmed.endsWith('|') || trimmed.endsWith('&&');
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          if (!nextTrimmed) break;
          if (LANG_HEADER_REGEX.test(nextTrimmed)) break;

          if (isCodeLineForLang(nextLine, 'BASH', prevContinuation)) {
            codeBuffer.push(nextLine);
            prevContinuation = nextTrimmed.endsWith('\\') || nextTrimmed.endsWith('|') || nextTrimmed.endsWith('&&');
            j++;
          } else {
            break;
          }
        }

        result.push('```BASH\n' + codeBuffer.join('\n').trim() + '\n```');
        i = j;
        continue;
      }

      result.push(line);
      i++;
    }

    return result.join('\n');
  }

  function parseFormattedContent(text) {
    if (!text) return '';

    // Auto-detect code blocks if not already formatted with markdown backticks
    let workingText = preProcessAutoCodeBlocks(text);

    // 1. Extract markdown fenced code blocks: ```lang ... ```
    const codeBlocks = [];
    let processed = workingText.replace(/```([a-zA-Z0-9_\-\+]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const id = '___CODE_BLOCK_' + codeBlocks.length + '___';
      codeBlocks.push({ lang: (lang || 'KOD').toUpperCase(), code: code.trim() });
      return id;
    });

    // 2. Extract inline code: `code`
    const inlineCodes = [];
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = '___INLINE_CODE_' + inlineCodes.length + '___';
      inlineCodes.push(code);
      return id;
    });

    // 3. Escape HTML
    processed = escapeHtml(processed);

    // 4. Linkify remaining URLs
    const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    processed = processed.replace(urlPattern, (url) => {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });

    // 5. Convert line breaks (outside code blocks) to <br>
    processed = processed.replace(/\n/g, '<br>');

    // 6. Restore inline codes with mini copy button
    inlineCodes.forEach((code, idx) => {
      const cleanCode = escapeHtml(code);
      const pill = `<span class="inline-code-pill"><code>${cleanCode}</code><button type="button" class="btn-copy-inline" data-code="${cleanCode}" title="Kodu Kopyala"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></span>`;
      processed = processed.replace('___INLINE_CODE_' + idx + '___', pill);
    });

    // 7. Restore code blocks with mini header, language tag, and mini copy button
    codeBlocks.forEach((item, idx) => {
      const cleanCode = escapeHtml(item.code);
      const cleanLang = escapeHtml(item.lang);
      const block = `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-tag">${cleanLang}</span><button type="button" class="btn-copy-code" data-code="${cleanCode}" title="Kodu Kopyala"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Kopyala</span></button></div><pre class="code-pre"><code>${cleanCode}</code></pre></div>`;
      processed = processed.replace(new RegExp('(?:<br>)?___CODE_BLOCK_' + idx + '___(?:<br>)?', 'g'), block);
    });

    return processed;
  }

  function extractFirstUrl(text) {
    const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
    const match = text.match(urlPattern);
    return match ? match[0] : null;
  }

  function showToast(message, type = 'normal') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'danger' ? 'toast-danger' : type === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span></span>
    `;
    toast.querySelector('span').textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast(t('toast_copied', 'Panoya kopyalandı!'), 'success');
    } catch (err) {
      showToast(t('toast_copy_fail', 'Kopyalama başarısız oldu.'), 'danger');
    }
  }

  async function fetchSystemInfo() {
    try {
      const res = await fetch(`${BASE_PATH}/api/info`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.lanIp) lanHostUrl = data.lanUrl;
      }
    } catch (e) {
      // Local or PHP mode
    }
  }

  function getShareableRoomUrl(roomId) {
    let origin = window.location.origin;
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && lanHostUrl) {
      origin = lanHostUrl;
    }
    return `${origin}${BASE_PATH}/${roomId}`;
  }

  function compressImage(file, maxDimension = 1920, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve({
            dataUrl,
            width,
            height,
            estimatedSize: Math.round((dataUrl.length * 3) / 4)
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir görsel seçin.', 'danger');
      return;
    }

    try {
      showToast('Görsel optimize ediliyor...');
      const compressed = await compressImage(file);
      pendingImageBase64 = compressed.dataUrl;
      pendingImageFile = {
        name: file.name,
        size: compressed.estimatedSize,
        type: file.type
      };

      previewImgTag.src = compressed.dataUrl;
      previewFilename.textContent = file.name;
      previewFilesize.textContent = formatBytes(compressed.estimatedSize);
      composerImgPreview.classList.remove('hidden');
      composerText.focus();
    } catch (err) {
      console.error(err);
      showToast('Görsel işlenirken hata oluştu.', 'danger');
    }
  }

  function clearPendingImage() {
    pendingImageBase64 = null;
    pendingImageFile = null;
    previewImgTag.src = '';
    composerImgPreview.classList.add('hidden');
    imageUploadInput.value = '';
  }

  function openQuickPasteModal() {
    if (!quickPasteModal) return;
    quickPasteModal.classList.remove('hidden');
    if (quickPasteInput) {
      quickPasteInput.value = '';
      setTimeout(() => {
        quickPasteInput.focus();
      }, 60);
    }
  }

  function closeQuickPasteModal() {
    if (!quickPasteModal) return;
    quickPasteModal.classList.add('hidden');
    if (quickPasteInput) quickPasteInput.value = '';
  }

  async function handlePasteAction() {
    // 1. Attempt clipboard.read() (supports image detection directly)
    if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], `clipboard-image-${Date.now()}.png`, { type: imageType });
            await handleImageFile(file);
            showToast(t('toast_img_pasted'), 'success');
            return;
          }
        }
      } catch (readErr) {
        // Fallback silently if browser blocks clipboard.read()
        console.warn('Clipboard read() rejected/unsupported:', readErr);
      }
    }

    // 2. Attempt clipboard.readText() (often permitted or prompts simply)
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          composerText.value = (composerText.value ? composerText.value + '\n' : '') + text;
          composerText.focus();
          showToast(t('toast_clip_pasted'), 'success');
          return;
        } else if (text !== undefined && text !== null && text === '') {
          showToast(t('toast_clip_empty'), 'danger');
          return;
        }
      } catch (textErr) {
        console.warn('Clipboard readText() rejected/unsupported:', textErr);
      }
    }

    // 3. Browser blocked permission or unsupported -> Open Quick Paste Dropzone modal
    openQuickPasteModal();
  }

  // =============================================================
  // FILE SHARING (PDF, OFFICE, ARCHIVES) — CHUNKED UPLOAD
  // =============================================================

  let fileSettings = null;
  let fileBackend = null; // 'node' or 'php'
  let uploadQueue = Promise.resolve();

  const FILE_ICONS = {
    pdf: '📕', doc: '📘', docx: '📘', odt: '📘', rtf: '📘',
    xls: '📗', xlsx: '📗', ods: '📗', csv: '📗',
    ppt: '📙', pptx: '📙', odp: '📙',
    zip: '🗜️', rar: '🗜️', '7z': '🗜️', txt: '📄'
  };

  function fileApiUrl(action, params = {}) {
    const qs = new URLSearchParams(params).toString();
    if (fileBackend === 'node') {
      const routes = { settings: 'settings', init: 'files/init', chunk: 'files/chunk', complete: 'files/complete' };
      return `${BASE_PATH}/api/${routes[action]}${qs ? '?' + qs : ''}`;
    }
    const actions = { settings: 'get_settings', init: 'upload_init', chunk: 'upload_chunk', complete: 'upload_complete' };
    return `${BASE_PATH}/api.php?action=${actions[action]}${qs ? '&' + qs : ''}`;
  }

  function fileDownloadUrl(item) {
    if (fileBackend === 'node') {
      return `${BASE_PATH}/api/files/${encodeURIComponent(currentRoomId)}/${encodeURIComponent(item.fileId)}`;
    }
    return `${BASE_PATH}/api.php?action=get_file&room=${encodeURIComponent(currentRoomId)}&id=${encodeURIComponent(item.fileId)}`;
  }

  async function loadFileSettings() {
    // Node serves JSON at /api/settings; on PHP hosts that path falls through to index.php (HTML)
    try {
      const res = await fetch(`${BASE_PATH}/api/settings`, { cache: 'no-store' });
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        fileBackend = 'node';
        fileSettings = (await res.json()).files;
      }
    } catch (e) {}

    if (fileBackend !== 'node') {
      fileBackend = 'php';
      try {
        const res = await fetch(fileApiUrl('settings'), { cache: 'no-store' });
        if (res.ok) fileSettings = (await res.json()).files;
      } catch (e) {}
    }

    const fileLabel = document.getElementById('file-upload-label');
    const fileInput = document.getElementById('file-upload-input');
    if (fileLabel) fileLabel.classList.toggle('hidden', !(fileSettings && fileSettings.enabled));
    if (fileInput && fileSettings) {
      fileInput.accept = fileSettings.allowedExtensions.map(e => '.' + e).join(',');
    }
  }

  function setUploadStatus(text, percent) {
    let bar = document.getElementById('composer-upload-status');
    if (text === null) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'composer-upload-status';
      bar.className = 'upload-status';
      bar.innerHTML = '<span class="upload-status-text"></span><div class="upload-status-track"><div class="upload-status-fill"></div></div>';
      document.querySelector('.composer-body').appendChild(bar);
    }
    bar.querySelector('.upload-status-text').textContent = text;
    bar.querySelector('.upload-status-fill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'Sunucu hatası.');
    return data;
  }

  // Routes any dropped/selected/pasted file: images keep the compressed inline flow
  function handleAnyFile(file) {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      handleImageFile(file);
      return;
    }
    uploadQueue = uploadQueue.then(() => uploadGenericFile(file));
  }

  async function uploadGenericFile(file) {
    if (!fileSettings) await loadFileSettings();
    if (!fileSettings || !fileSettings.enabled) {
      showToast('Dosya paylaşımı yönetici tarafından kapatılmış.', 'danger');
      return;
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (!fileSettings.allowedExtensions.includes(ext)) {
      showToast(`Bu dosya türü desteklenmiyor. İzin verilenler: ${fileSettings.allowedExtensions.join(', ')}`, 'danger');
      return;
    }
    if (file.size === 0) {
      showToast('Boş dosya gönderilemez.', 'danger');
      return;
    }
    if (file.size > fileSettings.maxFileSizeBytes) {
      showToast(`Dosya çok büyük (${formatBytes(file.size)}). En fazla ${fileSettings.maxFileSizeMB} MB yüklenebilir.`, 'danger');
      return;
    }

    setUploadStatus(`⏫ ${file.name} yükleniyor... %0`, 0);
    try {
      const init = await postJson(fileApiUrl('init'), {
        roomId: currentRoomId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });

      const chunkSize = init.chunkSize || fileSettings.chunkSize;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const res = await fetch(fileApiUrl('chunk', { uploadId: init.uploadId, offset }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file.slice(offset, offset + chunkSize)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'Yükleme yarıda kesildi.');
        const percent = Math.round((data.received / file.size) * 100);
        setUploadStatus(`⏫ ${file.name} yükleniyor... %${percent}`, percent);
      }

      const done = await postJson(fileApiUrl('complete', { uploadId: init.uploadId }), {
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      });
      // Node broadcasts item_added over the socket; PHP clients see it on the next poll
      if (fileBackend === 'php' && done.item) addClipToDom(done.item, true);
      showToast(`${file.name} paylaşıldı.`, 'success');
    } catch (err) {
      showToast(err.message || 'Dosya yüklenemedi.', 'danger');
    } finally {
      setUploadStatus(null);
    }
  }

  // =============================================================
  // ROOM OWNERSHIP, TERMS OF USE & ABUSE REPORTS
  // =============================================================

  const OWNER_TOKENS_KEY = 'ulak_owner_tokens';
  const TERMS_KEY = 'ulak_terms_v1';
  let roomOwnerProtected = false;

  // The device that created a room keeps its owner token; only it may destroy the room
  function readOwnerTokens() {
    try {
      const all = JSON.parse(localStorage.getItem(OWNER_TOKENS_KEY) || '{}');
      const cutoff = Date.now() - 48 * 3600 * 1000; // rooms live at most 24 h
      Object.keys(all).forEach(k => { if (!all[k] || all[k].t < cutoff) delete all[k]; });
      return all;
    } catch (e) {
      return {};
    }
  }

  function saveOwnerToken(roomId, token) {
    if (!token) return;
    const all = readOwnerTokens();
    all[roomId] = { token, t: Date.now() };
    try { localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  function getOwnerToken(roomId) {
    const entry = readOwnerTokens()[roomId];
    return entry ? entry.token : '';
  }

  function setRoomOwnerProtected(value) {
    roomOwnerProtected = Boolean(value);
    const canDestroy = !roomOwnerProtected || Boolean(getOwnerToken(currentRoomId));
    btnPromptDestroy.classList.toggle('hidden', !canDestroy);
  }

  function hasAcceptedTerms() {
    try { return localStorage.getItem(TERMS_KEY) === 'yes'; } catch (e) { return false; }
  }

  function buildModal(innerHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-dialog modal-dialog-md">${innerHtml}</div>`;
    document.body.appendChild(modal);
    return modal;
  }

  /** Shows the terms once per browser; resolves to true when accepted. */
  function ensureTermsAccepted() {
    if (hasAcceptedTerms()) return Promise.resolve(true);
    const en = currentLang === 'en';
    return new Promise(resolve => {
      const modal = buildModal(`
        <div class="modal-header">
          <h3 class="modal-title">${en ? '📜 Terms of Use' : '📜 Kullanım Koşulları'}</h3>
        </div>
        <div class="modal-body" style="font-size: 0.9rem; line-height: 1.6; color: var(--text-muted);">
          <p>${en
            ? 'Sharing illegal content on Ulak is <strong>prohibited</strong>: child abuse material, malware, phishing, pirated content, other people\'s personal data, threats or harassment.'
            : 'Ulak üzerinden yasa dışı içerik paylaşmak <strong>yasaktır</strong>: çocuk istismarı içeren materyal, zararlı yazılım, oltalama, korsan içerik, başkasına ait kişisel veriler, tehdit veya taciz.'}</p>
          <p>${en
            ? 'To prevent abuse, room creation, shares and uploads are logged with <strong>IP address, time and a file fingerprint</strong> for a limited period. Content itself is not kept in these logs.'
            : 'Kötüye kullanımı önlemek için oda açma, paylaşım ve yüklemelerde <strong>IP adresi, zaman ve dosya özeti</strong> sınırlı bir süre kaydedilir. İçeriğin kendisi bu kayıtlarda tutulmaz.'}</p>
          <p>${en
            ? 'Use the <strong>Report</strong> button in a room to flag inappropriate content.'
            : 'Uygunsuz bir içerik görürseniz odadaki <strong>Bildir</strong> düğmesini kullanın.'}
            <a href="#" class="terms-legal-link" style="color: var(--accent-sky, #38bdf8); text-decoration: underline;">${en ? 'Full legal notice' : 'Yasal uyarının tamamı'}</a></p>
          <label style="display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; color: var(--text-main); cursor: pointer;">
            <input type="checkbox" class="terms-check" style="margin-top: 4px;">
            <span>${en ? 'I have read the terms and will not share illegal content.' : 'Koşulları okudum, yasa dışı içerik paylaşmayacağım.'}</span>
          </label>
        </div>
        <div class="modal-buttons" style="display: flex; gap: 10px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary terms-cancel" style="flex: 1;">${en ? 'Cancel' : 'Vazgeç'}</button>
          <button type="button" class="btn btn-primary terms-accept" style="flex: 1;" disabled>${en ? 'Accept' : 'Kabul Ediyorum'}</button>
        </div>
      `);
      const check = modal.querySelector('.terms-check');
      const accept = modal.querySelector('.terms-accept');
      check.addEventListener('change', () => { accept.disabled = !check.checked; });
      modal.querySelector('.terms-legal-link').addEventListener('click', (e) => {
        e.preventDefault();
        openLegalNoticeModal();
      });
      const close = (ok) => {
        if (ok) {
          try { localStorage.setItem(TERMS_KEY, 'yes'); } catch (e) {}
        }
        modal.remove();
        resolve(ok);
      };
      accept.addEventListener('click', () => close(true));
      modal.querySelector('.terms-cancel').addEventListener('click', () => close(false));
    });
  }

  const REPORT_REASONS = [
    ['illegal', 'Yasa dışı içerik', 'Illegal content'],
    ['malware', 'Zararlı yazılım / oltalama', 'Malware / phishing'],
    ['harassment', 'Taciz / tehdit', 'Harassment / threats'],
    ['copyright', 'Telif hakkı ihlali', 'Copyright infringement'],
    ['other', 'Diğer', 'Other']
  ];

  function openReportModal() {
    const en = currentLang === 'en';
    const modal = buildModal(`
      <div class="modal-header">
        <h3 class="modal-title">${en ? '🚩 Report this room' : '🚩 Bu odayı bildir'}</h3>
      </div>
      <div class="modal-body" style="font-size: 0.9rem; color: var(--text-muted);">
        <p style="margin-bottom: 12px;">${en
          ? 'The administrator will review the room and may close it. Your report is anonymous to other users.'
          : 'Yönetici odayı inceleyip kapatabilir. Bildiriminizi odadaki diğer kişiler görmez.'}</p>
        <label style="display: block; margin-bottom: 6px; color: var(--text-main);">${en ? 'Reason' : 'Sebep'}</label>
        <select class="report-reason" style="width: 100%; padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.3); color: var(--text-main); border: 1px solid var(--border-subtle);">
          ${REPORT_REASONS.map(([value, tr, enLabel]) => `<option value="${value}">${en ? enLabel : tr}</option>`).join('')}
        </select>
        <label style="display: block; margin: 12px 0 6px; color: var(--text-main);">${en ? 'Details (optional)' : 'Açıklama (isteğe bağlı)'}</label>
        <textarea class="report-details" maxlength="500" rows="3" style="width: 100%; padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.3); color: var(--text-main); border: 1px solid var(--border-subtle);"></textarea>
      </div>
      <div class="modal-buttons" style="display: flex; gap: 10px; margin-top: 16px;">
        <button type="button" class="btn btn-secondary report-cancel" style="flex: 1;">${en ? 'Cancel' : 'Vazgeç'}</button>
        <button type="button" class="btn btn-danger report-send" style="flex: 1;">${en ? 'Send report' : 'Bildir'}</button>
      </div>
    `);
    modal.querySelector('.report-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    const sendBtn = modal.querySelector('.report-send');
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try {
        if (!fileBackend) await loadFileSettings();
        const url = fileBackend === 'node' ? `${BASE_PATH}/api/report` : `${BASE_PATH}/api.php?action=report`;
        const data = await postJson(url, {
          roomId: currentRoomId,
          reason: modal.querySelector('.report-reason').value,
          details: modal.querySelector('.report-details').value
        });
        showToast(data.message || 'Bildiriminiz iletildi.', 'success');
        modal.remove();
      } catch (err) {
        showToast(err.message || 'Bildirim gönderilemedi.', 'danger');
        sendBtn.disabled = false;
      }
    });
  }

  function ensureReportButton() {
    if (document.getElementById('btn-report-room') || !btnPromptDestroy) return;
    const btn = document.createElement('button');
    btn.id = 'btn-report-room';
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-ghost';
    btn.title = currentLang === 'en' ? 'Report abuse' : 'Kötüye kullanımı bildir';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg><span class="hide-mobile">${currentLang === 'en' ? 'Report' : 'Bildir'}</span>`;
    btn.addEventListener('click', openReportModal);
    btnPromptDestroy.parentNode.insertBefore(btn, btnPromptDestroy);
  }

  // =============================================================
  // UNIVERSAL SYNC ENGINE (PHP POLLING & NODE SOCKET.IO)
  // =============================================================

  function joinRoom(roomId) {
    if (!hasAcceptedTerms()) {
      ensureTermsAccepted().then(ok => { if (ok) joinRoom(roomId); });
      return;
    }
    ensureReportButton();
    currentRoomId = roomId;
    loadFileSettings();
    window.history.replaceState({}, '', `${BASE_PATH}/${roomId}`);

    currentRoomNameEl.textContent = roomId;
    landingView.classList.add('hidden');
    roomView.classList.remove('hidden');
    destroyedScreen.classList.add('hidden');
    composerText.focus();

    // Check if Socket.IO is available and not failed
    if (typeof io !== 'undefined' && !window.__socketIoFailed) {
      try {
        engineType = 'socket';
        connectSocket(roomId);
        return;
      } catch (e) {
        console.warn('Socket connection failed, switching to PHP sync', e);
      }
    }

    // Default: Shared hosting PHP sync
    engineType = 'php';
    startPhpSync(roomId);
  }

  function connectSocket(roomId) {
    if (!socket) {
      socket = io({
        path: BASE_PATH ? `${BASE_PATH}/socket.io` : '/socket.io',
        timeout: 4000
      });
      setupSocketListeners();
    }

    socket.emit('join_room', {
      roomId,
      deviceName: myDeviceName,
      deviceId: myDeviceId
    });
  }

  function setupSocketListeners() {
    socket.on('connect_error', () => {
      // Fallback to PHP engine if Node socket drops on shared hosting
      if (engineType === 'socket') {
        console.log('Socket failed, activating PHP engine...');
        engineType = 'php';
        startPhpSync(currentRoomId);
      }
    });

    socket.on('room_error', (data) => {
      showToast(data.message || 'Oturuma bağlanılamadı.', 'danger');
      setTimeout(() => { window.location.href = BASE_URL; }, 2000);
    });

    socket.on('item_error', (data) => {
      showToast(data.message || 'Paylaşım gönderilemedi.', 'danger');
    });

    socket.on('room_joined', (data) => {
      setRoomOwnerProtected(data.ownerProtected);
      currentTtlMode = data.ttlMode;
      roomExpiresAt = data.expiresAt;
      startTtlCountdown();
      renderAllClips(data.items || []);
      if (data.livePad !== undefined) {
        livepadTextarea.value = data.livePad || '';
        currentLivepadChunks = (data.livePadChunks && data.livePadChunks.length > 0)
          ? data.livePadChunks
          : (data.livePad ? [{ t: data.livePad, dev: 'init', name: 'Ortak', color: 'cyan' }] : []);
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();
        updateLivepadStats();
      }
      updateDeviceCount(data.deviceCount || 1);
      showToast(`Odaya bağlanıldı: ${data.roomId}`, 'success');
    });

    socket.on('device_count_updated', (data) => updateDeviceCount(data.count || 1));

    socket.on('burn_countdown_started', (data) => {
      roomExpiresAt = data.expiresAt;
      showToast('🔥 İkinci cihaz bağlandı! 60 saniye içinde kendini imha edecek.', 'danger');
      startTtlCountdown();
    });

    socket.on('item_added', (item) => addClipToDom(item, true));

    socket.on('item_deleted', ({ itemId }) => {
      const el = document.getElementById(`clip-${itemId}`);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => el.remove(), 200);
      }
      updateClipsCounter();
    });

    socket.on('all_items_cleared', () => {
      clipsContainer.innerHTML = '';
      clipsContainer.appendChild(emptyClipsPlaceholder);
      emptyClipsPlaceholder.classList.remove('hidden');
      updateClipsCounter();
    });

    socket.on('live_pad_synced', (data) => {
      if (!isTypingInLivePad) {
        const start = livepadTextarea.selectionStart;
        const end = livepadTextarea.selectionEnd;
        livepadTextarea.value = data.text || '';
        livepadTextarea.setSelectionRange(start, end);
        updateLivepadStats();
        livepadSyncStatus.textContent = `🟢 ${data.updatedBy} güncelledi`;
        if (data.chunks && Array.isArray(data.chunks)) {
          currentLivepadChunks = data.chunks;
        } else if (data.text) {
          currentLivepadChunks = [{
            t: data.text,
            dev: 'other',
            name: data.updatedBy || 'Cihaz',
            color: getDeviceColor(data.updatedBy).id
          }];
        } else {
          currentLivepadChunks = [];
        }
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();
      }
    });

    socket.on('room_destroyed', (data) => {
      onRoomDestroyed(data.reason);
    });
  }

  // PHP Polling Engine (Every 1.5 seconds)
  function startPhpSync(roomId) {
    if (phpPollInterval) clearInterval(phpPollInterval);

    async function poll() {
      try {
        const url = `${BASE_PATH}/api.php?action=get_room&id=${encodeURIComponent(roomId)}&dev=${myDeviceId}&dev_name=${encodeURIComponent(myDeviceName)}`;
        const res = await fetch(url);
        
        if (res.status === 404) {
          onRoomDestroyed('Oturum süresi doldu veya imha edildi.');
          clearInterval(phpPollInterval);
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        setRoomOwnerProtected(data.ownerProtected);
        currentTtlMode = data.ttlMode;
        roomExpiresAt = data.expiresAt;
        startTtlCountdown();
        updateDeviceCount(data.deviceCount || 1);

        // Check if items changed (by itemsModified or items signature)
        const currentItemsSig = (data.items || []).map(i => `${i.id}_${i.createdAt}`).join('|');
        const itemsChanged = currentItemsSig !== lastRenderedClipsSignature || (data.itemsModified && data.itemsModified !== lastServerItemsModified);
        if (itemsChanged) {
          lastServerItemsModified = data.itemsModified || 0;
          lastServerModified = data.lastModified;
          renderAllClips(data.items || []);
        }

        // Live notepad sync
        if (!isTypingInLivePad && data.livePadUpdatedAt > lastLocalPadChangeTime) {
          if (livepadTextarea.value !== data.livePad) {
            const start = livepadTextarea.selectionStart;
            const end = livepadTextarea.selectionEnd;
            livepadTextarea.value = data.livePad || '';
            livepadTextarea.setSelectionRange(start, end);
            updateLivepadStats();
            if (data.livePadUpdatedBy) {
              livepadSyncStatus.textContent = `🟢 ${data.livePadUpdatedBy} güncelledi`;
            }
            if (data.livePadChunks && Array.isArray(data.livePadChunks)) {
              currentLivepadChunks = data.livePadChunks;
            } else if (data.livePad) {
              currentLivepadChunks = [{
                t: data.livePad,
                dev: 'other',
                name: data.livePadUpdatedBy || 'Cihaz',
                color: getDeviceColor(data.livePadUpdatedBy).id
              }];
            } else {
              currentLivepadChunks = [];
            }
            renderLivepadHighlights(currentLivepadChunks);
            syncLivepadScroll();
          }
        }
      } catch (err) {
        // Temporary network glitch, will retry on next tick
      }
    }

    poll();
    phpPollInterval = setInterval(poll, 1500);
  }

  function onRoomDestroyed(reason) {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);
    if (phpPollInterval) clearInterval(phpPollInterval);
    destroyedReasonText.textContent = reason || 'Oturum süresi doldu veya imha edildi.';
    destroyedScreen.classList.remove('hidden');
  }

  function updateDeviceCount(count) {
    deviceCountText.textContent = count === 1 ? t('device_count_single', '1 Cihaz Bağlı') : t('device_count_multi', '{n} Cihaz Bağlı').replace('{n}', count);
  }

  function startTtlCountdown() {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);

    function update() {
      if (currentTtlMode === 'burn_read' && !roomExpiresAt) {
        ttlCountdownText.textContent = t('ttl_opt_burn', 'Okunduğunda İmha');
        ttlTimerBadge.classList.remove('urgent');
        return;
      }

      if (!roomExpiresAt) return;

      const diff = roomExpiresAt - Date.now();
      if (diff <= 0) {
        ttlCountdownText.textContent = t('ttl_calc', 'İmha Ediliyor...');
        ttlTimerBadge.classList.add('urgent');
        clearInterval(countdownTimerInterval);
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      let str = '';
      if (hours > 0) {
        str = `${hours}s ${mins.toString().padStart(2, '0')}dk`;
      } else {
        str = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      ttlCountdownText.textContent = str;

      if (totalSec < 120) {
        ttlTimerBadge.classList.add('urgent');
      } else {
        ttlTimerBadge.classList.remove('urgent');
      }
    }

    update();
    countdownTimerInterval = setInterval(update, 1000);
  }

  function createClipCardElement(item) {
    const card = document.createElement('div');
    const isMine = item.senderDeviceId === myDeviceId || (!item.senderDeviceId && item.senderName === myDeviceName);
    card.className = `clip-card ${isMine ? 'clip-outgoing' : 'clip-incoming'}`;
    card.id = `clip-${item.id}`;
    const senderColor = isMine ? myDeviceColor : getDeviceColor(item.senderDeviceId || item.senderName);

    const isImage = item.type === 'image';
    const isFile = item.type === 'file';
    const hasSafeImage = isImage && isSafeImageDataUrl(item.content);
    const firstUrl = !isImage && !isFile ? extractFirstUrl(item.content) : null;
    const fileExt = isFile ? String(item.fileExt || '').toLowerCase() : '';

    let contentHtml = '';
    if (isFile) {
      contentHtml = `
        <div class="clip-file">
          <span class="clip-file-icon">${FILE_ICONS[fileExt] || '📎'}</span>
          <div class="clip-file-meta">
            <span class="clip-file-name">${escapeHtml(item.fileName || 'dosya')}</span>
            <span class="clip-file-type">${escapeHtml(fileExt.toUpperCase())} · ${escapeHtml(formatBytes(Number(item.fileSize) || 0))}</span>
          </div>
        </div>
      `;
    } else if (isImage && !hasSafeImage) {
      contentHtml = `<div class="clip-body">⚠️ Geçersiz görsel verisi engellendi.</div>`;
    } else if (isImage) {
      // src is assigned below via the DOM, never interpolated into HTML
      contentHtml = `
        <div class="clip-image-wrapper">
          <img alt="Paylaşılan Fotoğraf" loading="lazy">
        </div>
      `;
    } else {
      contentHtml = `
        <div class="clip-body">${parseFormattedContent(item.content)}</div>
        ${firstUrl ? `
          <div>
            <a href="${firstUrl}" target="_blank" rel="noopener noreferrer" class="clip-link-preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>${t('btn_open_url', 'Yeni Sekmede Aç')}</span>
            </a>
          </div>
        ` : ''}
      `;
    }

    card.innerHTML = `
      <div class="clip-header">
        <div class="clip-meta">
          <span class="clip-sender">
            <span class="sender-badge-inner">
              <span class="sender-dot" style="background:${senderColor.accent}; box-shadow: 0 0 6px ${senderColor.accent};"></span>
              <span>${isMine ? (currentLang === 'en' ? `You (${escapeHtml(item.senderName || 'This Device')})` : `Sen (${escapeHtml(item.senderName || 'Bu Cihaz')})`) : escapeHtml(item.senderName || (currentLang === 'en' ? 'Other Device' : 'Diğer Cihaz'))}</span>
            </span>
          </span>
          <span>${formatTime(item.createdAt)}</span>
          ${Number(item.fileSize) > 0 ? `<span>• ${escapeHtml(formatBytes(Number(item.fileSize)))}</span>` : ''}
        </div>
        <div class="clip-actions">
          ${isFile ? `
            <a class="btn btn-sm btn-outline btn-download-file" title="Dosyayı İndir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>${t('btn_download_img', 'İndir')}</span>
            </a>
          ` : !isImage ? `
            <button class="btn btn-sm btn-outline btn-copy-clip" title="${t('btn_copy_clip', 'Metni Kopyala')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>${t('btn_copy_clip', 'Kopyala')}</span>
            </button>
          ` : `
            <button class="btn btn-sm btn-outline btn-download-clip" title="${t('btn_download_img', 'Fotoğrafı İndir')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>${t('btn_download_img', 'İndir')}</span>
            </button>
          `}
          <button class="btn btn-sm btn-ghost btn-delete-clip" title="${t('btn_delete_clip', 'Sil')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      ${contentHtml}
    `;

    if (hasSafeImage) {
      card.querySelector('.clip-image-wrapper img').src = item.content;
    }

    const btnDownloadFile = card.querySelector('.btn-download-file');
    if (btnDownloadFile && /^[a-f0-9]{32}$/.test(item.fileId || '')) {
      btnDownloadFile.href = fileDownloadUrl(item);
      btnDownloadFile.setAttribute('download', item.fileName || 'dosya');
    }

    const btnCopy = card.querySelector('.btn-copy-clip');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => copyToClipboard(item.content));
    }

    // Mini copy buttons for code snippets inside the card
    card.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.code-block-wrapper');
        const code = wrapper ? wrapper.querySelector('code').textContent : btn.getAttribute('data-code');
        if (code) {
          await copyToClipboard(code);
          const origHtml = btn.innerHTML;
          btn.classList.add('copied');
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${t('toast_copied', 'Kopyalandı!')}</span>`;
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = origHtml;
          }, 1800);
        }
      });
    });

    card.querySelectorAll('.btn-copy-inline').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pill = btn.closest('.inline-code-pill');
        const code = pill ? pill.querySelector('code').textContent : btn.getAttribute('data-code');
        if (code) {
          await copyToClipboard(code);
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        }
      });
    });

    const btnDownload = card.querySelector('.btn-download-clip');
    if (btnDownload && hasSafeImage) {
      btnDownload.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = item.content;
        a.download = item.fileName || `ulak-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('İndirme başlatıldı.');
      });
    }

    const btnDelete = card.querySelector('.btn-delete-clip');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        if (engineType === 'socket' && socket) {
          socket.emit('delete_item', { itemId: item.id });
        } else {
          card.remove();
          lastRenderedClipsSignature = '';
          updateClipsCounter();
          await fetch(`${BASE_PATH}/api.php?action=delete_item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: currentRoomId, itemId: item.id })
          });
        }
      });
    }

    const imgWrapper = card.querySelector('.clip-image-wrapper');
    if (imgWrapper) {
      imgWrapper.addEventListener('click', () => {
        openLightbox(item.content, item.fileName);
      });
    }

    return card;
  }

  function renderAllClips(items) {
    const signature = (items || []).map(i => `${i.id}_${i.createdAt}`).join('|');
    if (signature === lastRenderedClipsSignature) {
      return; // Exact same list: do not touch DOM, preventing active text selections from dropping!
    }
    lastRenderedClipsSignature = signature;

    if (!items || items.length === 0) {
      clipsContainer.innerHTML = '';
      clipsContainer.appendChild(emptyClipsPlaceholder);
      emptyClipsPlaceholder.classList.remove('hidden');
      updateClipsCounter();
      return;
    }

    emptyClipsPlaceholder.classList.add('hidden');
    const incomingIds = new Set(items.map(item => String(item.id)));

    // 1. Remove only deleted cards
    clipsContainer.querySelectorAll('.clip-card').forEach(card => {
      const id = card.id.replace(/^clip-/, '');
      if (!incomingIds.has(id)) {
        card.remove();
      }
    });

    // 2. Reconcile in proper order (items[0] is at top) without re-creating existing cards
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      let card = document.getElementById(`clip-${item.id}`);
      if (!card) {
        card = createClipCardElement(item);
      }
      const existingAtPos = clipsContainer.children[idx];
      if (existingAtPos !== card) {
        clipsContainer.insertBefore(card, existingAtPos || null);
      }
    }

    updateClipsCounter();
  }

  function addClipToDom(item, prepend = true) {
    if (document.getElementById(`clip-${item.id}`)) return;
    emptyClipsPlaceholder.classList.add('hidden');

    const card = createClipCardElement(item);
    if (prepend && clipsContainer.firstChild) {
      clipsContainer.insertBefore(card, clipsContainer.firstChild);
    } else {
      clipsContainer.appendChild(card);
    }

    lastRenderedClipsSignature = '';
    updateClipsCounter();
  }

  function updateClipsCounter() {
    const count = clipsContainer.querySelectorAll('.clip-card').length;
    clipsCounter.textContent = count;
  }

  function openLightbox(imgSrc, filename) {
    lightboxImg.src = imgSrc;
    lightboxFilename.textContent = filename || 'Görsel Önizleme';
    btnLightboxDownload.onclick = () => {
      const a = document.createElement('a');
      a.href = imgSrc;
      a.download = filename || `ulak-photo-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    lightboxModal.classList.remove('hidden');
  }

  async function sendCurrentClip() {
    const text = composerText.value.trim();

    if (pendingImageBase64) {
      const payload = {
        roomId: currentRoomId,
        type: 'image',
        content: pendingImageBase64,
        fileName: pendingImageFile?.name,
        fileSize: pendingImageFile?.size,
        fileType: pendingImageFile?.type,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('add_item', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=add_item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      clearPendingImage();
    }

    if (text) {
      const payload = {
        roomId: currentRoomId,
        type: 'text',
        content: text,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('add_item', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=add_item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      composerText.value = '';
    }

    if (!pendingImageBase64 && !text) {
      showToast('Lütfen bir metin yazın veya görsel ekleyin.', 'danger');
    }
  }

  function updateLivepadStats() {
    const val = livepadTextarea.value || '';
    const chars = val.length;
    const words = val.trim() ? val.trim().split(/\s+/).length : 0;
    livepadCharCount.textContent = `${chars} karakter | ${words} kelime`;
  }

  // Client-Side QR Generation (Zero dependencies, runs 100% inside browser)
  function renderQrCode(url) {
    qrCanvasHolder.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrCanvasHolder, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // No third-party QR service: it would leak the private room link
      const fallback = document.createElement('div');
      fallback.style.cssText = 'padding: 16px; font-size: 0.85rem; word-break: break-all; color: #0f172a; background: #fff; border-radius: 8px;';
      fallback.textContent = url;
      qrCanvasHolder.appendChild(fallback);
    }
  }

  function openQrModal() {
    const shareUrl = getShareableRoomUrl(currentRoomId);
    modalRoomUrl.textContent = shareUrl;
    renderQrCode(shareUrl);

    if (navigator.share) {
      btnNativeShare.classList.remove('hidden');
    } else {
      btnNativeShare.classList.add('hidden');
    }

    qrModal.classList.remove('hidden');
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  ttlSelector.addEventListener('click', (e) => {
    const opt = e.target.closest('.ttl-option');
    if (!opt) return;
    ttlSelector.querySelectorAll('.ttl-option').forEach(b => b.classList.remove('active'));
    opt.classList.add('active');
    currentTtlMode = opt.dataset.ttl;
  });

  btnCreateRoom.addEventListener('click', async () => {
    if (!(await ensureTermsAccepted())) return;
    const customId = customRoomInput.value.trim();
    try {
      btnCreateRoom.disabled = true;
      btnCreateRoom.textContent = 'Oda Başlatılıyor...';

      let data = null;

      // Try Node route first, then PHP fallback
      try {
        const res = await fetch(`${BASE_PATH}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customId, ttlMode: currentTtlMode, acceptTerms: true })
        });
        const ctype = res.headers.get('content-type') || '';
        if (ctype.includes('application/json')) data = await res.json();
      } catch (err) {}

      if (!data) {
        // Standard PHP backend
        const res = await fetch(`${BASE_PATH}/api.php?action=create_room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customId, ttlMode: currentTtlMode, acceptTerms: true })
        });
        data = await res.json();
      }

      if (data && data.success) {
        saveOwnerToken(data.roomId, data.ownerToken);
        joinRoom(data.roomId);
      } else {
        showToast((data && data.error) || 'Oda oluşturulamadı.', 'danger');
      }
    } catch (err) {
      showToast('Bağlantı hatası.', 'danger');
    } finally {
      btnCreateRoom.disabled = false;
      btnCreateRoom.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        Hemen Oturumu Başlat
      `;
    }
  });

  formJoinRoom.addEventListener('submit', (e) => {
    e.preventDefault();
    let val = joinRoomInput.value.trim();
    if (!val) return;

    if (val.includes('/chat/')) {
      val = val.split('/chat/')[1].split('?')[0].split('#')[0];
    } else if (val.includes('/s/')) {
      val = val.split('/s/')[1].split('?')[0].split('#')[0];
    } else if (val.includes('r=')) {
      val = new URL(val).searchParams.get('r');
    } else if (val.includes('room=')) {
      val = new URL(val).searchParams.get('room');
    }

    val = val.replace(/[^a-zA-Z0-9\-_]/g, '');
    if (val) {
      joinRoom(val);
    }
  });

  roomIdBadge.addEventListener('click', () => {
    copyToClipboard(currentRoomId);
  });

  btnCopyLink.addEventListener('click', () => {
    const shareUrl = getShareableRoomUrl(currentRoomId);
    copyToClipboard(shareUrl);
  });

  btnShowQr.addEventListener('click', openQrModal);
  btnCloseQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.classList.add('hidden');
  });

  btnModalCopyLink.addEventListener('click', () => {
    copyToClipboard(getShareableRoomUrl(currentRoomId));
  });

  btnNativeShare.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Ulak: ${currentRoomId}`,
          text: `Ulak anlık panosuna katıl:`,
          url: getShareableRoomUrl(currentRoomId)
        });
      } catch (err) {}
    }
  });

  btnCloseLightbox.addEventListener('click', () => lightboxModal.classList.add('hidden'));
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) lightboxModal.classList.add('hidden');
  });

  btnPromptDestroy.addEventListener('click', () => {
    destroyConfirmModal.classList.remove('hidden');
  });
  btnCancelDestroy.addEventListener('click', () => {
    destroyConfirmModal.classList.add('hidden');
  });
  destroyConfirmModal.addEventListener('click', (e) => {
    if (e.target === destroyConfirmModal) destroyConfirmModal.classList.add('hidden');
  });
  btnConfirmDestroy.addEventListener('click', async () => {
    destroyConfirmModal.classList.add('hidden');
    const ownerToken = getOwnerToken(currentRoomId);
    if (engineType === 'socket' && socket) {
      socket.emit('destroy_room_now', { ownerToken });
    } else {
      const res = await fetch(getApiUrl('action=destroy_room'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, ownerToken })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Oda imha edilemedi.', 'danger');
        return;
      }
      onRoomDestroyed('Oturum kullanıcı tarafından anında imha edildi.');
    }
  });

  btnRestartApp.addEventListener('click', () => {
    window.location.href = BASE_URL;
  });

  tabClipsBtn.addEventListener('click', () => {
    tabClipsBtn.classList.add('active');
    tabLivepadBtn.classList.remove('active');
    tabClipsContent.classList.remove('hidden');
    tabLivepadContent.classList.add('hidden');
  });

  tabLivepadBtn.addEventListener('click', () => {
    tabLivepadBtn.classList.add('active');
    tabClipsBtn.classList.remove('active');
    tabLivepadContent.classList.remove('hidden');
    tabClipsContent.classList.add('hidden');
    livepadTextarea.focus();
  });

  btnQuickPaste.addEventListener('click', handlePasteAction);

  imageUploadInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  const fileUploadInput = document.getElementById('file-upload-input');
  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', (e) => {
      Array.from(e.target.files || []).forEach(handleAnyFile);
      fileUploadInput.value = '';
    });
  }

  // Drag & drop files anywhere on the composer card
  const composerCard = document.querySelector('.composer-card');
  if (composerCard) {
    composerCard.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        composerCard.classList.add('drag-over');
      }
    });
    composerCard.addEventListener('dragleave', (e) => {
      if (!composerCard.contains(e.relatedTarget)) composerCard.classList.remove('drag-over');
    });
    composerCard.addEventListener('drop', (e) => {
      composerCard.classList.remove('drag-over');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) {
        e.preventDefault();
        files.forEach(handleAnyFile);
      }
    });
  }

  btnCancelPreview.addEventListener('click', clearPendingImage);
  btnSendClip.addEventListener('click', sendCurrentClip);

  composerText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendCurrentClip();
    }
  });

  window.addEventListener('paste', (e) => {
    if (landingView.classList.contains('hidden')) {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              handleImageFile(blob);
              showToast('Görsel yapıştırıldı!', 'success');
              break;
            }
          } else if (item.kind === 'file') {
            const pastedFile = item.getAsFile();
            if (pastedFile) {
              handleAnyFile(pastedFile);
              break;
            }
          }
        }
      }
    }
  });

  // Quick Paste Modal Listeners
  if (btnClosePasteModal) {
    btnClosePasteModal.addEventListener('click', closeQuickPasteModal);
  }
  if (btnCancelPasteModal) {
    btnCancelPasteModal.addEventListener('click', closeQuickPasteModal);
  }
  if (quickPasteModal) {
    quickPasteModal.addEventListener('click', (e) => {
      if (e.target === quickPasteModal) closeQuickPasteModal();
    });
  }

  function handleDirectPasteData(clipboardData) {
    if (!clipboardData) return false;
    
    // Check for image
    const items = clipboardData.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            handleImageFile(blob);
            showToast(t('toast_img_pasted'), 'success');
            closeQuickPasteModal();
            return true;
          }
        }
      }
    }

    // Check for text
    const text = clipboardData.getData('text/plain');
    if (text && text.trim()) {
      composerText.value = (composerText.value ? composerText.value + '\n' : '') + text;
      closeQuickPasteModal();
      composerText.focus();
      showToast(t('toast_clip_pasted'), 'success');
      return true;
    }

    return false;
  }

  if (quickPasteZone) {
    quickPasteZone.addEventListener('click', () => {
      if (quickPasteInput) quickPasteInput.focus();
    });
    quickPasteZone.addEventListener('paste', (e) => {
      if (handleDirectPasteData(e.clipboardData)) {
        e.preventDefault();
      }
    });
  }

  if (quickPasteInput) {
    quickPasteInput.addEventListener('paste', (e) => {
      if (handleDirectPasteData(e.clipboardData)) {
        e.preventDefault();
      }
    });
    quickPasteInput.addEventListener('input', () => {
      const val = quickPasteInput.value;
      if (val && val.trim()) {
        composerText.value = (composerText.value ? composerText.value + '\n' : '') + val.trim();
        closeQuickPasteModal();
        composerText.focus();
        showToast(t('toast_clip_pasted'), 'success');
      }
    });
  }

  composerText.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            handleImageFile(blob);
            showToast(t('toast_img_pasted'), 'success');
            break;
          }
        }
      }
    }
  });

  btnClearAll.addEventListener('click', async () => {
    if (confirm('Tüm pano öğelerini bu oturumdan silmek istediğinize emin misiniz?')) {
      if (engineType === 'socket' && socket) {
        socket.emit('clear_items');
      } else {
        clipsContainer.innerHTML = '';
        clipsContainer.appendChild(emptyClipsPlaceholder);
        emptyClipsPlaceholder.classList.remove('hidden');
        updateClipsCounter();
        await fetch(`${BASE_PATH}/api.php?action=clear_items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: currentRoomId })
        });
      }
    }
  });

  livepadTextarea.addEventListener('input', () => {
    isTypingInLivePad = true;
    lastLocalPadChangeTime = Date.now() / 1000;
    const newText = livepadTextarea.value;

    // Compute updated chunks with author neon assignment
    currentLivepadChunks = computeUpdatedChunks(
      currentLivepadChunks,
      newText,
      myDeviceId,
      myDeviceName,
      myDeviceColor.id
    );

    renderLivepadHighlights(currentLivepadChunks);
    syncLivepadScroll();
    updateLivepadStats();
    livepadSyncStatus.textContent = '⏳ Gönderiliyor...';

    clearTimeout(livePadDebounceTimeout);
    livePadDebounceTimeout = setTimeout(async () => {
      const payload = {
        roomId: currentRoomId,
        text: livepadTextarea.value,
        chunks: currentLivepadChunks,
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('update_live_pad', payload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      livepadSyncStatus.textContent = '🟢 Senkronize';
      isTypingInLivePad = false;
    }, 250);
  });

  livepadTextarea.addEventListener('scroll', syncLivepadScroll);

  btnLivepadCopy.addEventListener('click', () => {
    copyToClipboard(livepadTextarea.value);
  });

  btnLivepadPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        livepadTextarea.value = text;
        lastLocalPadChangeTime = Date.now() / 1000;
        updateLivepadStats();

        currentLivepadChunks = computeUpdatedChunks(
          currentLivepadChunks,
          livepadTextarea.value,
          myDeviceId,
          myDeviceName,
          myDeviceColor.id
        );
        renderLivepadHighlights(currentLivepadChunks);
        syncLivepadScroll();

        const pastePayload = {
          roomId: currentRoomId,
          text: livepadTextarea.value,
          chunks: currentLivepadChunks,
          senderName: myDeviceName,
          senderDeviceId: myDeviceId
        };

        if (engineType === 'socket' && socket) {
          socket.emit('update_live_pad', pastePayload);
        } else {
          await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pastePayload)
          });
        }
        showToast('Metin yapıştırıldı ve senkronize edildi!', 'success');
      }
    } catch (e) {
      showToast('Panodan okuma başarısız.', 'danger');
    }
  });

  btnLivepadClear.addEventListener('click', async () => {
    if (confirm('Canlı not defterini temizlemek istiyor musunuz?')) {
      livepadTextarea.value = '';
      lastLocalPadChangeTime = Date.now() / 1000;
      updateLivepadStats();

      currentLivepadChunks = [];
      renderLivepadHighlights(currentLivepadChunks);

      const clearPayload = {
        roomId: currentRoomId,
        text: '',
        chunks: [],
        senderName: myDeviceName,
        senderDeviceId: myDeviceId
      };

      if (engineType === 'socket' && socket) {
        socket.emit('update_live_pad', clearPayload);
      } else {
        await fetch(`${BASE_PATH}/api.php?action=update_live_pad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clearPayload)
        });
      }
      showToast('Not defteri temizlendi.');
    }
  });


  // =============================================================
  // DEVICE RENAMING (FAIL-SAFE: AUTO-INJECT MODAL & PROMPT FALLBACK)
  // =============================================================

  function ensureDeviceRenameModal() {
    let modal = document.getElementById('device-rename-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'device-rename-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-sm">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Cihaz Adınızı Belirleyin
          </h3>
          <button type="button" class="btn-close-modal modal-close-btn" id="btn-close-device-modal" title="Kapat">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc" style="margin-bottom: 12px; font-size: 0.88rem; color: var(--text-muted); line-height: 1.5;">
            Mesajlarınızın ve canlı notlarınızın karışmaması için bu cihaza bir isim verin (örn: MacBook, Ofis PC, iPhone):
          </p>
          <div class="form-group">
            <input type="text" id="device-rename-input" placeholder="Örn: MacBook, Ofis PC, iPhone..." maxlength="24" autocomplete="off" style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.95rem;">
          </div>
        </div>
        <div class="modal-buttons" style="display: flex; gap: 10px; margin-top: 18px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-device-rename" style="flex: 1;">Vazgeç</button>
          <button type="button" class="btn btn-primary" id="btn-save-device-rename" style="flex: 1;">Kaydet</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openDeviceRenameModal() {
    try {
      const modal = ensureDeviceRenameModal();
      const input = document.getElementById('device-rename-input');
      if (modal && input) {
        input.value = myDeviceName;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '99999';
        setTimeout(() => {
          input.focus();
          input.select();
        }, 50);
        return;
      }
    } catch (err) {
      console.warn('Modal open error, falling back to prompt:', err);
    }

    // Direct browser prompt fallback - NEVER fails under any browser environment
    const newName = window.prompt('Cihaz adınızı belirleyin (örn: MacBook, Ofis PC, iPhone):', myDeviceName);
    if (newName && newName.trim()) {
      applyDeviceName(newName.trim());
    }
  }

  function closeDeviceRenameModal() {
    const modal = document.getElementById('device-rename-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  function applyDeviceName(newName) {
    const val = (newName || '').trim();
    if (!val) {
      showToast('Cihaz adı boş olamaz.', 'danger');
      return;
    }
    myDeviceName = val;
    try {
      localStorage.setItem('ulak_dev_name', myDeviceName);
      localStorage.setItem('airclip_dev_name', myDeviceName);
    } catch (e) {}

    applyLanguage(currentLang);
    updateDeviceHeaderBadge();
    closeDeviceRenameModal();
    showToast(`Cihaz adınız güncellendi: ${myDeviceName}`, 'success');

    if (engineType === 'socket' && socket) {
      socket.emit('update_device_name', { deviceName: myDeviceName });
    }
  }

  function saveDeviceName() {
    const input = document.getElementById('device-rename-input');
    const val = input ? input.value : myDeviceName;
    applyDeviceName(val);
  }

  // Direct click binding if button exists
  if (btnDeviceName) {
    btnDeviceName.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDeviceRenameModal();
    });
  }

  // =============================================================
  // LEGAL, PRIVACY & DISCLAIMER MODAL HANDLERS
  // =============================================================

  function openLegalNoticeModal() {
    const modal = document.getElementById('legal-notice-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.style.zIndex = '10001';
    }
  }

  function closeLegalNoticeModal() {
    const modal = document.getElementById('legal-notice-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  // Global Event Delegation (Guarantees clicks on device pill, inner texts, dots, icons, and modals are ALWAYS caught)
  document.addEventListener('click', (e) => {
    // 1. Device pill / rename button clicked anywhere in the DOM
    const targetPill = e.target.closest('#btn-device-name, .device-pill, #header-device-name, #header-device-dot, .btn-device-edit, #landing-device-name, .my-device-chip');
    if (targetPill) {
      e.preventDefault();
      e.stopPropagation();
      openDeviceRenameModal();
      return;
    }

    // 2. Save rename button clicked
    if (e.target.closest('#btn-save-device-rename')) {
      e.preventDefault();
      saveDeviceName();
      return;
    }

    // 3. Close device rename modal
    if (e.target.closest('#btn-cancel-device-rename, #btn-close-device-modal') || e.target.id === 'device-rename-modal') {
      e.preventDefault();
      closeDeviceRenameModal();
      return;
    }

    // 4. Legal notice modal open triggers
    if (e.target.closest('#btn-open-legal, #link-legal-privacy, #link-legal-terms, #link-legal-disclaimer, #link-room-legal-privacy, #link-room-legal-terms, #link-room-legal-disclaimer, .link-room-legal, #btn-room-legal, #link-composer-legal')) {
      e.preventDefault();
      openLegalNoticeModal();
      return;
    }

    // 5. Legal notice modal close triggers
    if (e.target.closest('#btn-close-legal-modal, #btn-accept-legal') || e.target.id === 'legal-notice-modal') {
      e.preventDefault();
      closeLegalNoticeModal();
      return;
    }
  });

  // Keyboard shortcut (Enter to save, Escape to cancel)
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'device-rename-input') {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveDeviceName();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDeviceRenameModal();
      }
    }
    if (e.key === 'Escape') {
      closeLegalNoticeModal();
    }
  });

  // Neon Highlighter Toggle
  if (btnToggleNeonHighlighter) {
    btnToggleNeonHighlighter.addEventListener('click', () => {
      isNeonHighlighterActive = !isNeonHighlighterActive;
      if (livepadHighlights) {
        livepadHighlights.style.opacity = isNeonHighlighterActive ? '1' : '0';
      }
      if (neonToggleText) {
        neonToggleText.textContent = isNeonHighlighterActive ? 'Vurgu: Açık' : 'Vurgu: Kapalı';
      }
      showToast(isNeonHighlighterActive ? 'Yazar neon vurguları açıldı.' : 'Yazar neon vurguları gizlendi.');
    });
  }

  function detectRoomFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('r')) return urlParams.get('r').trim();
    if (urlParams.has('room')) return urlParams.get('room').trim();

    let path = window.location.pathname;
    if (BASE_PATH && path.startsWith(BASE_PATH)) {
      path = path.substring(BASE_PATH.length);
    }
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const parts = cleanPath.split('/').filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    let sub = parts.join('/');
    if (sub.startsWith('s/')) sub = sub.substring(2);

    const room = sub.split('/')[0];
    const reserved = ['index.html', 'index.php', 'api.php', 'style.css', 'app.js', 'qrcode.min.js', 'favicon.ico', 'c', 'chat', ''];
    if (room && !reserved.includes(room.toLowerCase())) {
      return room;
    }
    return null;
  }

  // Anonymous page view for the admin's daily statistics (no personal data is sent)
  async function trackVisit() {
    if (!fileBackend) await loadFileSettings();
    const url = fileBackend === 'node' ? `${BASE_PATH}/api/track` : `${BASE_PATH}/api.php?action=track`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: myDeviceId }),
        keepalive: true
      });
    } catch (e) {}
  }

  async function init() {
    updateDeviceHeaderBadge();
    trackVisit();
    await fetchSystemInfo();

    const detectedRoom = detectRoomFromUrl();
    if (detectedRoom) {
      joinRoom(detectedRoom);
    }
  }

  init();
})();
