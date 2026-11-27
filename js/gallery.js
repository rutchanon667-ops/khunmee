/* Khun Mee: ดูรูปขนาดใหญ่ ปัดซ้าย-ขวา (มือถือ ไอแพด คอม)
 * ใส่ data-gallery บนปุ่ม/ลิงก์ที่ครอบรูป
 *   data-gallery="room" data-room="3"   → รูปของห้อง 3 (KM_CONFIG.ROOM_GALLERY + ROOM_GALLERY_EXTRA)
 *   data-gallery="living"               → รูปพื้นที่ส่วนกลาง (KM_CONFIG.LIVING_GALLERY)
 *   data-src="images/..."               → เริ่มที่รูปนี้ · data-title="..." → ชื่อด้านบน
 * ปิดได้ด้วยปุ่ม ✕, แตะพื้นที่ว่าง, Esc หรือปุ่มย้อนกลับของโทรศัพท์
 */
(function () {
  var C = window.KM_CONFIG || {};
  var root, track, counter, title, prevBtn, nextBtn, list = [], idx = 0, lastFocus = null, pushed = false, scrollY = 0;

  function uniq(a) { var o = []; a.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

  /* รายการรูปจากหลังบ้าน (Photos.gs) · ยังไม่ได้ตั้งค่า/โหลดไม่ได้ = ใช้รูปใน js/config.js */
  var LIVE_KEY = 'km_gallery_v1', live = null;
  try { var c0 = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); if (c0 && c0.data && c0.data.managed && Date.now() - c0.t < 7 * 864e5) live = c0.data; } catch (e) {}
  var baseRoomImage = window.kmRoomImage || function () { return ''; };
  window.kmRoomImage = function (no) {
    var c = live && live.covers && live.covers[String(no)];
    return c || baseRoomImage(no);
  };
  function refresh() {
    if (!window.kmApi || !/^https:\/\//.test(C.API_URL || '')) return;
    window.kmApi('publicGallery').then(function (d) {
      var next = d && d.managed ? d : null;
      var changed = JSON.stringify(next) !== JSON.stringify(live);
      live = next;
      try { next ? localStorage.setItem(LIVE_KEY, JSON.stringify({ t: Date.now(), data: next })) : localStorage.removeItem(LIVE_KEY); } catch (e) {}
      if (changed) { try { window.dispatchEvent(new Event('km-gallery')); } catch (e) {} }
    }).catch(function () {});
  }
  // ชุดรูปห้อง/ห้องน้ำ/พื้นที่ส่วนกลาง ใช้จากหลังบ้านเมื่อนำเข้าแล้ว (imported) · ข้อมูลเก่าที่ไม่มี imported ถือว่านำเข้าแล้ว
  function galleryLive() { return !!(live && live.imported !== false); }
  function sets() { return (live && live.sets) || {}; }
  function isVideo(x) { return /^yt:/.test(String(x || '')); }
  function roomList(no) {
    var main = window.kmRoomImage(no);
    if (galleryLive()) return uniq([main].concat(sets()['room:' + no] || [], sets().extra || []));
    var g = (C.ROOM_GALLERY || {})[String(no)] || [];
    return uniq([main].concat(g, C.ROOM_GALLERY_EXTRA || []));
  }
  function livingList() {
    return galleryLive() ? (sets().living || []).slice() : (C.LIVING_GALLERY || []).slice();
  }
  /** รูปเดี่ยวในหน้าแรก (hero / quote / map) จากหลังบ้าน หรือรูปเดิม */
  function single(key, fallback) {
    var a = (sets()[key] || []).filter(function (x) { return !isVideo(x); });
    return a[0] || fallback;
  }
  /** รหัส YouTube ของวิดีโอชมบรรยากาศ ('' = ไม่มี) */
  function tourId() {
    var v = (sets().tour || []).filter(isVideo)[0];
    return v ? v.slice(3) : '';
  }
  function ytThumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
  function ytEmbed(id, auto) { return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&modestbranding=1' + (auto ? '&autoplay=1' : ''); }

  function css() {
    var st = document.createElement('style');
    st.textContent =
      '.kmg{position:fixed;inset:0;z-index:1000;background:#181512;display:flex;flex-direction:column;color:#F6F3EE;font-family:inherit;opacity:0;transition:opacity .18s}' +
      '.kmg.on{opacity:1}.kmg[hidden]{display:none}' +
      '.kmg-top{display:flex;align-items:center;gap:12px;padding:max(12px,env(safe-area-inset-top)) 12px 12px 20px}' +
      '.kmg-title{flex:1 1 auto;min-width:0;font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.kmg-count{font-size:14px;color:#D9D1C5;font-variant-numeric:tabular-nums}' +
      '.kmg-x{flex:0 0 auto;width:48px;height:48px;border-radius:9999px;border:0;background:rgba(246,243,238,.14);color:#FFF;display:flex;align-items:center;justify-content:center;cursor:pointer}' +
      '.kmg-x:hover{background:rgba(246,243,238,.26)}' +
      '.kmg-track{flex:1 1 auto;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
      '.kmg-track::-webkit-scrollbar{display:none}' +
      '.kmg-slide{flex:0 0 100%;width:100%;height:100%;scroll-snap-align:center;scroll-snap-stop:always;display:flex;align-items:center;justify-content:center;padding:0 12px 12px;box-sizing:border-box}' +
      '.kmg-slide img{max-width:100%;max-height:100%;object-fit:contain;border-radius:10px;user-select:none;-webkit-user-drag:none}' +
      '.kmg-vid{position:relative;width:min(100%,calc((100dvh - 150px) * 16 / 9));aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000}' +
      '.kmg-vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
      '.kmg-play{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:#000;cursor:pointer}' +
      '.kmg-play img{width:100%;height:100%;max-width:none;max-height:none;object-fit:cover;border-radius:0;opacity:.85}' +
      '.kmg-play span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:9999px;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center}' +
      '.km-zoom .km-zoom-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:9999px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;pointer-events:none}' +
      '.kmg-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:9999px;border:0;background:rgba(246,243,238,.16);color:#FFF;display:none;align-items:center;justify-content:center;cursor:pointer}' +
      '.kmg-nav:hover{background:rgba(246,243,238,.3)}.kmg-nav:disabled{opacity:.25;cursor:default}' +
      '.kmg-prev{left:16px}.kmg-next{right:16px}' +
      '@media (hover:hover) and (pointer:fine){.kmg-nav{display:flex}.kmg-slide{padding:0 84px 24px}}' +
      '.kmg-dots{display:flex;justify-content:center;gap:8px;padding:4px 0 max(16px,env(safe-area-inset-bottom))}' +
      '.kmg-dots i{width:7px;height:7px;border-radius:9999px;background:rgba(246,243,238,.35)}.kmg-dots i.on{background:#F6F3EE}' +
      '.kmg button:focus-visible{outline:2px solid #DCC881;outline-offset:2px}' +
      'html.kmg-lock,html.kmg-lock body{overflow:hidden}' +
      '.km-zoom{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in;border-radius:inherit;font:inherit;color:inherit;text-align:left}' +
      '.km-zoom img{display:block}' +
      '.km-zoom .km-zoom-tag{position:absolute;right:10px;bottom:10px;display:inline-flex;align-items:center;gap:8px;background:rgba(58,53,47,.78);color:#FFF;border-radius:9999px;padding:8px 12px;font-size:12px;font-weight:600;pointer-events:none}';
    document.head.appendChild(st);
  }
  var ICON = {
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    l: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>',
    r: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>'
  };

  function build() {
    css();
    root = document.createElement('div');
    root.className = 'kmg'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'ดูรูปขนาดใหญ่');
    root.innerHTML = '<div class="kmg-top"><span class="kmg-title"></span><span class="kmg-count" aria-live="polite"></span>' +
      '<button type="button" class="kmg-x" aria-label="ปิดรูปขนาดใหญ่">' + ICON.x + '</button></div>' +
      '<div class="kmg-track"></div>' +
      '<button type="button" class="kmg-nav kmg-prev" aria-label="รูปก่อนหน้า">' + ICON.l + '</button>' +
      '<button type="button" class="kmg-nav kmg-next" aria-label="รูปถัดไป">' + ICON.r + '</button>' +
      '<div class="kmg-dots" aria-hidden="true"></div>';
    document.body.appendChild(root);
    track = root.querySelector('.kmg-track'); counter = root.querySelector('.kmg-count'); title = root.querySelector('.kmg-title');
    prevBtn = root.querySelector('.kmg-prev'); nextBtn = root.querySelector('.kmg-next');
    root.querySelector('.kmg-x').addEventListener('click', function () { close(); });
    prevBtn.addEventListener('click', function () { go(idx - 1); });
    nextBtn.addEventListener('click', function () { go(idx + 1); });
    // แตะพื้นที่ว่างรอบรูป = ปิด
    track.addEventListener('click', function (e) {
      var play = e.target.closest && e.target.closest('.kmg-play');
      if (play) { e.stopPropagation(); playAt(play); return; }
      if (e.target.tagName !== 'IMG' && !(e.target.closest && e.target.closest('.kmg-vid'))) close();
    });
    var t = null;
    track.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(sync, 60); }, { passive: true });
    window.addEventListener('resize', function () { if (!root.hidden) track.scrollLeft = idx * track.clientWidth; });
    // ฟังที่ document: โฟกัสอาจหลุดจากหน้าต่างรูป (เช่น หลังเล่นวิดีโอ) แต่ Esc และลูกศรต้องยังใช้ได้
    document.addEventListener('keydown', function (e) {
      if (!root || root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'Tab') {   // วนโฟกัสอยู่ในหน้าต่างรูป
        var f = [].slice.call(root.querySelectorAll('button')).filter(function (b) { return b.offsetParent && !b.disabled; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    window.addEventListener('popstate', function () { if (!root.hidden) { pushed = false; close(true); } });
  }

  function sync() {
    var w = track.clientWidth || 1;
    var i = Math.max(0, Math.min(list.length - 1, Math.round(track.scrollLeft / w)));
    if (i !== idx) { idx = i; stopVideos(); }
    paint();
  }
  function paint() {
    counter.textContent = list.length > 1 ? (idx + 1) + ' / ' + list.length : '';
    prevBtn.disabled = idx <= 0; nextBtn.disabled = idx >= list.length - 1;
    prevBtn.style.visibility = nextBtn.style.visibility = list.length > 1 ? '' : 'hidden';
    var dots = root.querySelector('.kmg-dots');
    dots.innerHTML = list.length > 1 ? list.map(function (_, i) { return '<i' + (i === idx ? ' class="on"' : '') + '></i>'; }).join('') : '';
  }
  function go(i) {
    if (i < 0 || i >= list.length) return;
    idx = i; stopVideos();
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    paint();
  }

  function open(imgs, start, name) {
    if (!imgs || !imgs.length) return;
    if (!root) build();
    list = imgs.slice(); idx = Math.max(0, Math.min(imgs.length - 1, start || 0));
    title.textContent = name || '';
    track.innerHTML = list.map(function (src, i) {
      if (isVideo(src)) return '<div class="kmg-slide">' + poster(src.slice(3), i) + '</div>';
      return '<div class="kmg-slide"><img src="' + src.replace(/"/g, '&quot;') + '" alt="' + (name ? name.replace(/"/g, '&quot;') + ' ' : '') + 'รูปที่ ' + (i + 1) + ' จาก ' + list.length + '"' + (Math.abs(i - idx) > 1 ? ' loading="lazy"' : '') + ' draggable="false"></div>';
    }).join('');
    lastFocus = document.activeElement;
    scrollY = window.scrollY;
    document.documentElement.classList.add('kmg-lock');
    root.hidden = false;
    requestAnimationFrame(function () {
      track.scrollLeft = idx * track.clientWidth;
      root.classList.add('on');
      paint();
      root.querySelector('.kmg-x').focus();
    });
    try { history.pushState({ kmGallery: 1 }, ''); pushed = true; } catch (e) { pushed = false; }
  }

  var PLAY_SVG = '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#3A352F"></path></svg>';
  function poster(id, i) {
    return '<div class="kmg-vid"><button type="button" class="kmg-play" data-yt="' + id + '" aria-label="เล่นวิดีโอ (รายการที่ ' + (i + 1) + ')">' +
      '<img src="' + ytThumb(id) + '" alt="" loading="lazy"><span>' + PLAY_SVG + '</span></button></div>';
  }
  function playAt(btn) {
    var id = btn.getAttribute('data-yt'), box = btn.parentNode;
    box.innerHTML = '<iframe src="' + ytEmbed(id, true) + '" title="วิดีโอ" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
  }
  /* หยุดวิดีโอที่เล่นอยู่ (กลับเป็นภาพตัวอย่าง) เมื่อปัดไปรายการอื่นหรือปิดหน้าต่าง */
  function stopVideos() {
    if (!track) return;
    [].slice.call(track.querySelectorAll('.kmg-vid iframe')).forEach(function (f) {
      var m = String(f.getAttribute('src')).match(/embed\/([\w-]{11})/);
      var box = f.parentNode, i = [].indexOf.call(track.children, box.parentNode);
      if (m) box.outerHTML = poster(m[1], i);
    });
  }

  function close(fromPop) {
    if (!root || root.hidden) return;
    root.classList.remove('on');
    root.hidden = true;
    track.innerHTML = '';
    document.documentElement.classList.remove('kmg-lock');
    window.scrollTo(0, scrollY);
    if (!fromPop && pushed) { pushed = false; try { history.back(); } catch (e) {} }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-gallery]');
    if (!el) return;
    e.preventDefault();
    var kind = el.getAttribute('data-gallery');
    var imgs = kind === 'living' ? livingList()
      : kind === 'room' ? roomList(el.getAttribute('data-room')) : [];
    var src = el.getAttribute('data-src') || ((el.querySelector('img') || {}).getAttribute ? el.querySelector('img').getAttribute('src') : '');
    if (src && imgs.indexOf(src) < 0) imgs.unshift(src);
    if (!imgs.length && src) imgs = [src];
    open(imgs, Math.max(0, imgs.indexOf(src)), el.getAttribute('data-title') || '');
  });

  window.kmGallery = { open: open, close: close, roomList: roomList, living: livingList, refresh: refresh,
    single: single, tourId: tourId, ytThumb: ytThumb, ytEmbed: ytEmbed, isVideo: isVideo,
    countLabel: function (l) { var v = (l || []).filter(isVideo).length; return ((l || []).length - v) + ' รูป' + (v ? ' · ▶ วิดีโอ ' + v : ''); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh); else setTimeout(refresh, 0);
})();
