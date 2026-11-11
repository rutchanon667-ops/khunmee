/**********************************************************
 * Khun Mhee: LINE ฝั่งลูกค้า (LineGuest.gs)
 *
 * 1) ลูกค้าเชื่อมการจองกับ LINE OA ได้ 2 วิธี
 *    - กดปุ่ม "เชื่อมกับ LINE" ในหน้าจอง/หน้าเช็คอิน → แอป LINE เปิดแชทพร้อมข้อความ "เชื่อมการจอง XXXXXX" → กดส่ง
 *    - พิมพ์ในแชทเอง: รหัสการจอง ตามด้วยเบอร์โทรที่ใช้จอง เช่น KM261103ABCD 0812345678
 * 2) คำสั่งในแชท (พิมพ์เอง หรือตั้งเป็นปุ่มใน Rich menu แบบ "ข้อความ")
 *    รหัสประตู · การจองของฉัน · เช็คอิน · เช็คเอาท์ · ติดต่อที่พัก · เมนู · ยกเลิกการเชื่อม
 *    - "รหัสประตู" ส่งรหัสให้เฉพาะการจองที่เช็คอินแล้ว (ยืนยันตัวตนด้วยบัตรแล้ว) และยังอยู่ในช่วงเข้าพัก
 *    - ยังไม่เช็คอิน: ส่งปุ่มไปหน้าเช็คอินแทน
 *    - พิมพ์ "เช็คอิน": ตอบปุ่มลิงก์ไปหน้าเช็คอินบนเว็บเสมอ
 * 3) แจ้งเตือนลูกค้าทาง LINE อัตโนมัติ (นับโควตาข้อความ push ของ OA)
 *    อนุมัติการจอง · ยกเลิกการจอง · 1 วันก่อนเช็คอิน · ถึงเวลาเช็คอิน · หลังเช็คอิน (ส่งรหัสประตู)
 *    · เช้าวันเช็คเอาท์ · หลังเช็คเอาท์ (ขอบคุณ)
 *    รหัสประตูส่งให้ทาง LINE เท่านั้น (LG_DOOR_ON_WEB = false): ไม่แสดงบนหน้าเช็คอิน ไม่ส่งทางอีเมล
 *    ลูกค้ากดเมนู "รับรหัสประตู" ใน Rich menu (ส่งข้อความ "รหัสประตู") เพื่อรับรหัส
 * 4) อุดช่องโหว่ เช็คอินด่วน (publicQuickCheckin ใน Extras.gs) ที่ให้รหัสประตูโดยไม่ยืนยันบัตร
 *    ตอนนี้ถ้า LG_REQUIRE_ID = true ต้องเช็คอินผ่านฟอร์มบัตร (publicSelfCheckin) เท่านั้น
 *
 * ติดตั้ง
 *   1) Apps Script กด + → Script ตั้งชื่อ LineGuest แล้ววางโค้ดทั้งไฟล์นี้
 *      ไฟล์นี้ต้องอยู่ "ล่างสุด" (ใต้ Code.gs, Reschedule.gs, SelfCheckin.gs และ Extras.gs)
 *   2) Project Settings → Script properties เพิ่ม
 *        LINE_OA_ID        LINE ID ของ OA เช่น @khunmhee (ดูใน LINE OA Manager)
 *        CHECKIN_PAGE_URL  ลิงก์หน้า checkin.html บน GitHub Pages (ถ้ายังไม่ได้ใส่)
 *   3) เลือกฟังก์ชัน setupLineGuest แล้วกด Run 1 ครั้ง
 *   4) Deploy → Manage deployments → แก้ไข → Version: New version แล้วกด Deploy
 *   5) LINE OA Manager → ตั้งค่าการตอบกลับ: เปิด Webhook, ปิด "ข้อความตอบกลับอัตโนมัติ"
 *      และปิด "ข้อความทักทาย" (ระบบส่งข้อความต้อนรับให้เอง) หรือตั้ง LG_WELCOME = false
 *
 * แท็บใหม่ LineGuests: 1 แถวต่อ 1 บัญชี LINE ที่เชื่อมกับ 1 การจอง (ลบอัตโนมัติหลังเช็คเอาท์ LG_KEEP_DAYS วัน)
 **********************************************************/

/***** ตั้งค่า *****/
const LG_REQUIRE_ID = false;      // false = เช็คอินด้วยรหัสการจอง + เบอร์โทรอย่างเดียว ไม่ต้องกรอกเลขบัตร/ถ่ายรูปบัตร (แทน SC_REQUIRE_ID)
const LG_CHECKIN_ANYTIME = true;  // true = เช็คอินได้ทั้งวันในวันเข้าพัก ไม่ล็อกเวลา SC_CHECKIN_HOUR (แต่ต้องรอห้องว่าง)
const LG_ROOM_BUSY_MSG = 'ขออภัย ห้องพักยังไม่พร้อมเช็คอิน เนื่องจากอยู่ระหว่างรอผู้เข้าพักก่อนหน้าเช็คเอาท์ ' +
  'กรุณาโทรหาเจ้าหน้าที่ครับ';
const LG_DOOR_ON_WEB = false;      // false = รหัสประตูรับได้ทาง LINE เท่านั้น (ไม่แสดงบนเว็บ ไม่ส่งอีเมล)
const LG_NOTIFY = true;            // ส่งแจ้งเตือนถึงลูกค้าทาง LINE (push) · false = ตอบเฉพาะเมื่อลูกค้าพิมพ์ถาม
const LG_WELCOME = true;           // ส่งข้อความต้อนรับเมื่อลูกค้าเพิ่มเพื่อน OA
const LG_THANKS = true;            // ส่งข้อความขอบคุณหลังเช็คเอาท์
const LG_REMIND_HOUR = 9;          // เตือนก่อนวันเช็คอิน 1 วัน และเตือนเช้าวันเช็คเอาท์ ตอนกี่โมง
const LG_MAX_PER_BOOKING = 3;      // 1 การจองเชื่อมได้กี่บัญชี LINE (เช่น มากันสองคน)
const LG_LINK_MINUTES = 30;        // ลิงก์เชื่อม LINE จากหน้าเว็บใช้ได้กี่นาที (ใช้ได้ครั้งเดียว)
const LG_MAX_TRIES = 6;            // ผูกการจองผิดได้กี่ครั้งต่อชั่วโมงต่อบัญชี LINE
const LG_KEEP_DAYS = 30;           // เก็บการเชื่อม LINE ไว้กี่วันหลังเช็คเอาท์ แล้วลบอัตโนมัติ (PDPA)

const LG_GREEN_ = '#4F7A52', LG_BROWN_ = '#7D6043', LG_DARK_ = '#3A352F', LG_BLUE_ = '#3E6A9E',
      LG_AMBER_ = '#E9C46A', LG_RED_ = '#B5443F', LG_PAPER_ = '#F6F3EE', LG_INK_ = '#47413A';

SHEETS.lineGuests = {
  name: 'LineGuests',
  headers: ['id', 'userId', 'bookingId', 'code', 'displayName', 'linkedAt', 'notified']
};

/* =========================================================
 * ติดตั้ง (รันครั้งเดียวจากหน้า Apps Script)
 * ========================================================= */
function setupLineGuest() {
  lgSheet_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'lgHourly')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lgHourly').timeBased().everyHours(1).create();

  const p = lgPublicLine_();
  Logger.log('ติดตั้ง LINE ฝั่งลูกค้าแล้ว: แท็บ LineGuests และแจ้งเตือนรายชั่วโมง (lgHourly)');
  if (!lineProps_().token) Logger.log('ยังไม่มี LINE_CHANNEL_ACCESS_TOKEN ใน Script properties');
  if (!lgOaId_()) Logger.log('ยังไม่มี LINE_OA_ID ใน Script properties (เช่น @khunmhee) ปุ่ม "เชื่อมกับ LINE" บนเว็บจะยังไม่แสดง');
  if (!scPageUrl_()) Logger.log('ยังไม่มี CHECKIN_PAGE_URL ข้อความใน LINE จะไม่มีปุ่มไปหน้าเช็คอิน/เช็คเอาท์');
  if (!LG_REQUIRE_ID) Logger.log('หมายเหตุ: LG_REQUIRE_ID = false ลูกค้าเช็คอินได้โดยไม่ต้องแนบรูปบัตร');
  Logger.log(p.ready ? 'พร้อมใช้งาน · ลิงก์เพิ่มเพื่อน ' + p.chatUrl : 'ยังไม่พร้อม ใส่ค่าที่ขาดแล้วรัน setupLineGuest อีกครั้ง');
  Logger.log('อย่าลืม Deploy → Manage deployments → New version และตั้งค่าใน LINE OA Manager (ดูหัวไฟล์)');
}

function lgSheet_() {
  const def = SHEETS.lineGuests;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.appendRow(def.headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  }
  return sh;
}

/** การเชื่อมทั้งหมด (ยังไม่ได้รัน setup = ไม่มี) */
function lgLinks_() {
  try { return readTable_('lineGuests'); } catch (e) { return []; }
}

function lgOaId_() {
  const v = String(PropertiesService.getScriptProperties().getProperty('LINE_OA_ID') || '').trim().replace(/\s+/g, '');
  if (!v) return '';
  return v.charAt(0) === '@' ? v : '@' + v;
}

/** สำหรับหน้าเว็บ: แสดงปุ่ม LINE หรือไม่ และลิงก์เปิดแชท OA */
function lgPublicLine_() {
  const oa = lgOaId_();
  return { ready: !!(oa && lineProps_().token), chatUrl: oa ? 'https://line.me/R/ti/p/' + encodeURIComponent(oa) : '' };
}

/** ลิงก์หน้าเว็บ (อยู่โฟลเดอร์เดียวกับ CHECKIN_PAGE_URL) */
function lgPage_(file, params) {
  const base = scPageUrl_();
  if (!base) return '';
  const url = base.split(/[?#]/)[0].replace(/[^\/]*$/, file);
  const q = Object.keys(params || {}).filter(k => params[k])
    .map(k => k + '=' + encodeURIComponent(params[k])).join('&');
  return url + (q ? '?' + q : '');
}

function lgCheckinUrl_(b) { return lgPage_('checkin.html', { code: String(b.code), phone: phoneText_(b.phone) }); }
function lgCheckoutUrl_(b) { return lgPage_('checkout.html', { code: String(b.code), phone: phoneText_(b.phone) }); }

/* =========================================================
 * หน้าเว็บ: ขอลิงก์เชื่อม LINE (ยืนยันด้วยรหัสการจอง + เบอร์โทร)
 * คืน { url, chatUrl, linked, minutes } · url เปิดแชท OA พร้อมข้อความ "เชื่อมการจอง XXXXXX"
 * ========================================================= */
function publicLineLink(code, phone) {
  const b = scFind_(code, phone);
  const st = String(b.status);
  if (st === 'cancelled') throw new Error('การจองนี้ถูกยกเลิกแล้ว จึงเชื่อมกับ LINE ไม่ได้');
  if (st === 'checked_out' || strDate_(b.checkOut) < today_()) throw new Error('การจองนี้เช็คเอาท์แล้ว ขอบคุณที่มาพักกับเรา');
  const p = lgPublicLine_();
  if (!p.ready) throw new Error('ระบบ LINE ของที่พักยังไม่พร้อม กรุณาติดต่อ' + scContact_());
  const token = lgToken_();
  CacheService.getScriptCache().put('lg_tok_' + token, String(b.id), LG_LINK_MINUTES * 60);
  return {
    url: 'https://line.me/R/oaMessage/' + encodeURIComponent(lgOaId_()) + '/?' + encodeURIComponent('เชื่อมการจอง ' + token),
    chatUrl: p.chatUrl,
    linked: lgLinks_().filter(r => String(r.bookingId) === String(b.id)).length,
    minutes: LG_LINK_MINUTES
  };
}

function lgToken_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/* =========================================================
 * Webhook: รับข้อความจากลูกค้า (แชทส่วนตัวกับ OA เท่านั้น)
 * คำสั่งแอดมิน ("แอดมิน <รหัส>", "หยุดแจ้งเตือน", ปุ่มอนุมัติ) และข้อความในกลุ่ม ส่งต่อให้ Code.gs ตามเดิม
 * ตอบกลับด้วย reply token เสมอ (ไม่นับโควตา และข้อมูลไปถึงเฉพาะบัญชี LINE ที่ส่งข้อความมาจริง)
 * ========================================================= */
(function () {
  const orig = handleLineWebhook_;
  handleLineWebhook_ = function (body) {
    const rest = [];
    (body.events || []).forEach(ev => {
      let done = false;
      try {
        done = lgHandle_(ev);
      } catch (err) {
        console.error('LINE guest: ' + err);
        try {
          lgReply_(ev, [lgText_('ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในไม่กี่นาที หรือติดต่อ' + scContact_())]);
        } catch (e) {}
        done = true;
      }
      if (!done) rest.push(ev);
    });
    if (rest.length) return orig(Object.assign({}, body, { events: rest }));
    return ContentService.createTextOutput('OK');
  };
})();

/** คืน true ถ้าเป็นข้อความของลูกค้าที่จัดการแล้ว */
function lgHandle_(ev) {
  const src = ev.source || {};
  if (src.type !== 'user' || !src.userId) return false;
  const uid = String(src.userId);

  if (ev.type === 'follow') {
    if (LG_WELCOME) lgReply_(ev, lgWelcome_(uid));
    return true;
  }
  if (ev.type === 'postback') {
    const data = String((ev.postback && ev.postback.data) || '');
    if (!/^g=/.test(data)) return false;               // ปุ่มของแอดมิน (act=...)
    if (data === 'g=door') lgReply_(ev, lgDoorMsgs_(uid));
    else lgReply_(ev, lgStatusMsgs_(uid));
    return true;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return false;
  const text = String(ev.message.text || '').replace(/\s+/g, ' ').trim();
  if (/^(?:แอดมิน|admin) \S+$/i.test(text) || /^(?:หยุดแจ้งเตือน|stop)$/i.test(text)) return false;
  const msgs = lgCommand_(ev, uid, text);
  if (msgs && msgs.length) lgReply_(ev, msgs);
  return true;
}

const LG_RE_ = {
  token: /^เชื่อมการจอง ([A-Z0-9]{6})$/i,
  code: /(?:^|[^A-Z0-9])(KM\d{6}[A-Z0-9]{4})(?![A-Z0-9])/i,
  door: /^(?:ขอ)?รหัส(?:ประตู|เข้าห้อง|ห้อง)?$|^door ?code$/i,
  status: /^(?:การจอง(?:ของฉัน)?|สถานะ(?:การจอง)?|my booking)$/i,
  checkin: /^เช็[คก] ?อิน$|^check[ -]?in$/i,
  checkout: /^เช็[คก] ?เอาท์$|^check[ -]?out$/i,
  contact: /^ติดต่อ(?:ที่พัก|เรา|เจ้าหน้าที่)?$|^contact$/i,
  help: /^(?:เมนู|ช่วยเหลือ|วิธีใช้|help|menu|\?)$/i,
  unlink: /^ยกเลิกการเชื่อม(?:ต่อ)?(?: ?line)?$/i,
  phone: /^\+?[0-9][0-9\- ]{7,16}$/
};

function lgCommand_(ev, uid, text) {
  const cache = CacheService.getScriptCache();

  // 1) เชื่อมด้วยรหัสจากหน้าเว็บ
  const tok = text.match(LG_RE_.token);
  if (tok) {
    const blocked = lgBlocked_(uid);
    if (blocked) return blocked;
    const key = 'lg_tok_' + tok[1].toUpperCase();
    const id = cache.get(key);
    if (!id) {
      lgFail_(uid);
      return [lgText_('ลิงก์เชื่อม LINE หมดอายุหรือถูกใช้ไปแล้ว กรุณากดปุ่ม "เชื่อมกับ LINE" ในหน้าเว็บอีกครั้ง\n' +
        'หรือพิมพ์รหัสการจองตามด้วยเบอร์โทรที่ใช้จอง เช่น KM261103ABCD 0812345678')];
    }
    cache.remove(key);
    const b = readTable_('bookings').find(x => String(x.id) === id);
    if (!b) return [lgText_('ไม่พบการจองนี้แล้ว กรุณาติดต่อ' + scContact_())];
    return lgLink_(ev, b);
  }

  // 2) เชื่อมด้วยรหัสการจอง + เบอร์โทร (พิมพ์พร้อมกัน หรือพิมพ์รหัสก่อนแล้วตามด้วยเบอร์)
  const codeM = text.match(LG_RE_.code);
  const pending = cache.get('lg_pend_' + uid);
  if (codeM || (pending && LG_RE_.phone.test(text))) {
    const code = codeM ? codeM[1].toUpperCase() : pending;
    const phone = codeM ? text.replace(codeM[1], ' ').replace(/[^0-9+]/g, '') : text.replace(/[^0-9+]/g, '');
    if (phoneKey_(phone).length < 8) {
      cache.put('lg_pend_' + uid, code, 600);
      return [lgText_('ได้รับรหัสการจอง ' + code + ' แล้ว\nกรุณาพิมพ์เบอร์โทรที่ใช้ตอนจอง เพื่อยืนยันว่าเป็นการจองของคุณ')];
    }
    cache.remove('lg_pend_' + uid);
    const blocked = lgBlocked_(uid);
    if (blocked) return blocked;
    let b;
    try {
      b = scFind_(code, phone);
    } catch (e) {
      lgFail_(uid);
      return [lgText_(String((e && e.message) || e).replace(/^BUSY:\s*/, '') +
        '\nตรวจรหัสการจองและเบอร์โทรอีกครั้ง เช่น KM261103ABCD 0812345678')];
    }
    return lgLink_(ev, b);
  }

  if (LG_RE_.door.test(text)) return lgDoorMsgs_(uid);
  if (LG_RE_.status.test(text)) return lgStatusMsgs_(uid);
  if (LG_RE_.checkin.test(text)) return lgCheckinMsgs_(uid);
  if (LG_RE_.checkout.test(text)) return lgCheckoutMsgs_(uid);
  if (LG_RE_.contact.test(text)) return [lgText_(lgContactText_())];
  if (LG_RE_.help.test(text)) return lgWelcome_(uid);
  if (LG_RE_.unlink.test(text)) return lgUnlink_(uid);
  return null;   // ข้อความอื่น: ไม่ตอบอัตโนมัติ ให้เจ้าหน้าที่ตอบเองในแชท
}

/** ผูกผิดเกิน LG_MAX_TRIES ครั้งต่อชั่วโมง */
function lgBlocked_(uid) {
  const n = Number(CacheService.getScriptCache().get('lg_try_' + uid) || 0);
  return n >= LG_MAX_TRIES
    ? [lgText_('กรอกข้อมูลไม่ตรงหลายครั้ง กรุณารอ 1 ชั่วโมงแล้วลองใหม่ หรือติดต่อ' + scContact_())]
    : null;
}

function lgFail_(uid) {
  const cache = CacheService.getScriptCache();
  const key = 'lg_try_' + uid;
  cache.put(key, String(Number(cache.get(key) || 0) + 1), 3600);
}

/** เชื่อมการจองกับบัญชี LINE ที่ส่งข้อความมา */
function lgLink_(ev, b) {
  const src = ev.source || {};
  const uid = String(src.userId);
  const st = String(b.status);
  if (st === 'cancelled') return [lgText_('การจอง ' + b.code + ' ถูกยกเลิกแล้ว จึงเชื่อมกับ LINE ไม่ได้')];
  if (st === 'checked_out' || strDate_(b.checkOut) < today_()) {
    return [lgText_('การจอง ' + b.code + ' เช็คเอาท์แล้ว ขอบคุณที่มาพักกับ ' + HOTEL_NAME)];
  }
  const name = lineDisplayName_(src);
  const res = withLock_(() => {
    const rows = lgLinks_();
    if (rows.some(r => String(r.userId) === uid && String(r.bookingId) === String(b.id))) return 'same';
    if (rows.filter(r => String(r.bookingId) === String(b.id)).length >= LG_MAX_PER_BOOKING) return 'full';
    const row = { id: Utilities.getUuid(), userId: uid, bookingId: String(b.id), code: String(b.code),
                  displayName: safe_(name), linkedAt: new Date(), notified: '' };
    lgSheet_().appendRow(SHEETS.lineGuests.headers.map(h => row[h] === undefined ? '' : row[h]));
    return 'added';
  });
  if (res === 'full') {
    return [lgText_('การจอง ' + b.code + ' เชื่อมกับ LINE ครบ ' + LG_MAX_PER_BOOKING + ' บัญชีแล้ว หากต้องการเปลี่ยน กรุณาติดต่อ' + scContact_())];
  }
  CacheService.getScriptCache().remove('lg_try_' + uid);
  const head = res === 'same'
    ? 'การจอง ' + b.code + ' เชื่อมกับ LINE นี้ไว้แล้ว'
    : 'เชื่อมการจอง ' + b.code + ' กับ LINE นี้แล้ว';
  return [
    lgText_(head + '\nเราจะแจ้งเตือนก่อนวันเข้าพักและวันเช็คเอาท์ทางแชทนี้ ในวันเข้าพักกดเมนู "รับรหัสประตู" เพื่อรับรหัสประตูได้ตลอดการเข้าพัก'),
    lgBookingMsg_(b)
  ];
}

function lgUnlink_(uid) {
  const n = withLock_(() => {
    const rows = lgLinks_().filter(r => String(r.userId) === uid).sort((a, b) => b._row - a._row);
    rows.forEach(r => sheet_('lineGuests').deleteRow(r._row));
    return rows.length;
  });
  return [lgText_(n
    ? 'ยกเลิกการเชื่อม LINE นี้กับการจองแล้ว (' + n + ' รายการ) จะไม่มีการแจ้งเตือนและรหัสประตูส่งมาที่นี่อีก'
    : 'LINE นี้ยังไม่ได้เชื่อมกับการจองใด')];
}

/* =========================================================
 * คำตอบในแชท
 * ========================================================= */

/** การจองที่เชื่อมกับ LINE นี้ เรียงตามวันเช็คอิน [{ b, st }] (ไม่รวมที่จบแล้ว ถ้า activeOnly) */
function lgMine_(uid, activeOnly) {
  const ids = {};
  lgLinks_().forEach(r => { if (String(r.userId) === uid) ids[String(r.bookingId)] = true; });
  if (!Object.keys(ids).length) return null;
  return readTable_('bookings')
    .filter(b => ids[String(b.id)])
    .map(b => ({ b: b, st: scState_(b) }))
    .filter(x => !activeOnly || ['done', 'cancelled', 'missed'].indexOf(x.st.step) < 0)
    .sort((x, y) => strDate_(x.b.checkIn).localeCompare(strDate_(y.b.checkIn)));
}

function lgHowTo_() {
  return lgText_('LINE นี้ยังไม่ได้เชื่อมกับการจอง\n' +
    'พิมพ์รหัสการจองตามด้วยเบอร์โทรที่ใช้จอง เช่น\nKM261103ABCD 0812345678\n' +
    'หรือกดปุ่ม "เชื่อมกับ LINE" ในหน้าการจองหรือหน้าเช็คอินบนเว็บ');
}

function lgNothing_() {
  return lgText_('ตอนนี้ไม่มีการจองที่กำลังจะเข้าพักหรือเข้าพักอยู่ หากจองใหม่ พิมพ์รหัสการจองตามด้วยเบอร์โทรเพื่อเชื่อมกับ LINE นี้');
}

function lgDoorMsgs_(uid) {
  const mine = lgMine_(uid, true);
  if (!mine) return [lgHowTo_()];
  if (!mine.length) return [lgNothing_()];
  const out = mine.slice(0, 4).map(x => x.st.step === 'in' ? lgDoorCard_(x.b) : lgStatusCard_(x.b, x.st));
  if (!mine.some(x => x.st.step === 'in')) {
    out.unshift(lgText_('รหัสประตูจะส่งให้หลังเช็คอินแล้ว เช็คอินด้วยตัวเองได้' + lgCheckinWhen_()));
  }
  return out;
}

function lgStatusMsgs_(uid) {
  const mine = lgMine_(uid, true);
  if (!mine) return [lgHowTo_()];
  if (!mine.length) return [lgNothing_()];
  return mine.slice(0, 5).map(x => lgStatusCard_(x.b, x.st));
}

/** "เช็คอิน": ส่งปุ่มไปหน้าเช็คอินบนเว็บเสมอ (การจองที่เชื่อมแล้ว ลิงก์จะกรอกรหัสการจองและเบอร์โทรให้) */
function lgCheckinMsgs_(uid) {
  const page = lgPage_('checkin.html', {});
  if (!page) return [lgText_('เช็คอินด้วยตัวเองได้ที่หน้าเว็บของ ' + HOTEL_NAME + ' ' + lgCheckinWhen_().trim() + ' ด้วยรหัสการจองและเบอร์โทรที่ใช้จอง หากต้องการความช่วยเหลือ ติดต่อ' + scContact_())];
  const mine = (lgMine_(uid, true) || []).slice(0, 5);
  if (!mine.length) {
    return [lineCard_({
      title: 'เช็คอินด้วยตัวเอง', subtitle: HOTEL_NAME, color: LG_GREEN_, textColor: LG_PAPER_,
      alt: 'เช็คอินด้วยตัวเอง · ' + HOTEL_NAME,
      rows: [
        lineRow_('เวลา', lgCheckinWhen_().trim()),
        lineRow_('ใช้', 'รหัสการจองและเบอร์โทรที่ใช้จอง'),
        lineRow_('รหัสประตู', 'หลังเช็คอิน กดเมนู "รับรหัสประตู" ในแชทนี้')
      ],
      buttons: [{ label: 'ไปหน้าเช็คอิน', uri: page, primary: true, color: LG_GREEN_ }]
    })];
  }
  return mine.map(x => {
    const b = x.b, step = x.st.step;
    const status = step === 'in' ? 'เช็คอินแล้ว กดเมนู "รับรหัสประตู" เพื่อดูรหัสประตู'
      : step === 'open' ? 'เช็คอินได้แล้ว'
      : step === 'early' ? 'เช็คอินได้' + (LG_CHECKIN_ANYTIME ? 'ในวันที่ ' : 'ตั้งแต่ ' + SC_CHECKIN_HOUR + ':00 น. วันที่ ') + thShort_(strDate_(b.checkIn))
      : x.st.reason || '-';
    const buttons = [{ label: 'ไปหน้าเช็คอิน', uri: lgCheckinUrl_(b) || page, primary: true, color: LG_GREEN_ }];
    if (step === 'in') buttons.push({ label: 'ดูรหัสประตู', data: 'g=door', primary: true, color: LG_DARK_, group: 'door' });
    return lineCard_({
      title: 'เช็คอินด้วยตัวเอง', subtitle: HOTEL_NAME + ' · การจอง ' + b.code,
      color: LG_GREEN_, textColor: LG_PAPER_,
      alt: 'เช็คอินด้วยตัวเอง · ' + b.code + ' · ' + roomLabel_(b.roomNo),
      rows: [lineRow_('รหัส', String(b.code)), lineRow_('ห้อง', roomLabel_(b.roomNo)), lineRow_('เข้าพัก', lgRange_(b)),
             lineRow_('สถานะ', status)],
      buttons: buttons
    });
  });
}

function lgCheckoutMsgs_(uid) {
  const mine = lgMine_(uid, true);
  if (!mine) return [lgHowTo_()];
  const inStay = (mine || []).filter(x => x.st.step === 'in');
  if (!inStay.length) return [lgText_('ตอนนี้ไม่มีการจองที่เข้าพักอยู่ จึงยังไม่ต้องเช็คเอาท์')];
  return inStay.slice(0, 5).map(x => lgCheckoutCard_(x.b));
}

function lgContactText_() {
  const p = SC_STAY_INFO.contactPhone || (HOTEL_INFO && HOTEL_INFO.phone) || '';
  return 'ติดต่อ ' + HOTEL_NAME + (p ? '\nโทร ' + p : '') +
    '\nหรือพิมพ์ข้อความทิ้งไว้ในแชทนี้ เจ้าหน้าที่จะตอบกลับโดยเร็ว';
}

function lgWelcome_(uid) {
  const linked = !!lgMine_(uid, false);
  return [lgText_('ยินดีต้อนรับสู่ ' + HOTEL_NAME + ' · Pet Friendly House\n' +
    'แตะเมนูด้านล่าง หรือพิมพ์คำสั่งได้เลย\n' +
    '· รหัสประตู · ดูรหัสประตูในวันเข้าพัก\n' +
    '· การจองของฉัน · ดูสถานะการจอง\n' +
    '· เช็คอิน · เช็คอินด้วยตัวเอง' + lgCheckinWhen_() + '\n' +
    '· เช็คเอาท์ · ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น. ของวันเช็คเอาท์\n' +
    '· ติดต่อที่พัก' +
    (linked ? '' : '\n\nเริ่มจากเชื่อมการจอง: พิมพ์รหัสการจองตามด้วยเบอร์โทรที่ใช้จอง เช่น KM261103ABCD 0812345678'))];
}

/* =========================================================
 * ข้อความแบบการ์ด (โทนเดียวกับเว็บ: เขียว = เช็คอิน, น้ำตาล = เช็คเอาท์)
 * ========================================================= */
function lgQuick_() {
  return { items: ['รหัสประตู', 'การจองของฉัน', 'เช็คอิน', 'เช็คเอาท์', 'ติดต่อที่พัก'].map(t => (
    { type: 'action', action: { type: 'message', label: t, text: t } })) };
}

function lgText_(text) {
  return { type: 'text', text: String(text).slice(0, 4900) };
}

function lgReply_(ev, messages) {
  if (!ev.replyToken || !messages || !messages.length) return;
  const list = messages.slice(0, 5).map(m => Object.assign({}, m));
  list[list.length - 1].quickReply = lgQuick_();
  lineRequest_('reply', { replyToken: ev.replyToken, messages: list });
}

function lgRange_(b) {
  const ci = strDate_(b.checkIn), co = strDate_(b.checkOut);
  return thShort_(ci) + ' – ' + thShort_(co) + ' (' + daysBetween_(ci, co) + ' คืน)';
}

function lgBaseRows_(b) {
  return [
    lineRow_('รหัส', String(b.code)),
    lineRow_('ห้อง', roomLabel_(b.roomNo)),
    lineRow_('เข้าพัก', lgRange_(b)),
    lineRow_('เช็คอิน', (LG_CHECKIN_ANYTIME ? '' : 'ตั้งแต่ ' + SC_CHECKIN_HOUR + ':00 น. · ') + thShort_(strDate_(b.checkIn))),
    lineRow_('เช็คเอาท์', 'ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น. · ' + thShort_(strDate_(b.checkOut)))
  ];
}

/** การ์ดตามขั้นตอนของการจอง: เข้าพักอยู่ = การ์ดรหัสประตู, อื่น ๆ = การ์ดสถานะ */
function lgBookingMsg_(b) {
  const st = scState_(b);
  return st.step === 'in' ? lgDoorCard_(b) : lgStatusCard_(b, st);
}

function lgStatusCard_(b, st) {
  st = st || scState_(b);
  const T = {
    wait: ['รอยืนยันการชำระเงิน', LG_AMBER_, LG_DARK_],
    busy: ['ห้องพักยังไม่พร้อม', LG_AMBER_, LG_DARK_],
    early: ['ยืนยันการจองแล้ว', LG_GREEN_, LG_PAPER_],
    open: ['เช็คอินได้แล้ว', LG_GREEN_, LG_PAPER_],
    in: ['เข้าพักอยู่', LG_DARK_, LG_PAPER_],
    done: ['เช็คเอาท์แล้ว', LG_BROWN_, '#FFFFFF'],
    missed: ['เลยวันเข้าพักแล้ว', LG_RED_, '#FFF8F5'],
    cancelled: ['การจองถูกยกเลิก', LG_RED_, '#FFF8F5']
  }[st.step] || ['การจอง ' + b.code, LG_DARK_, LG_PAPER_];
  const rows = lgBaseRows_(b);
  if (st.reason && st.step !== 'in') rows.push(lineRow_('หมายเหตุ', st.reason));
  const ciUrl = lgCheckinUrl_(b);
  const buttons = [];
  if (st.step === 'open' && ciUrl) buttons.push({ label: 'เช็คอินตอนนี้', uri: ciUrl, primary: true, color: LG_GREEN_ });
  if (st.step === 'in') buttons.push({ label: 'ดูรหัสประตู', data: 'g=door', primary: true, color: LG_DARK_ });
  return lineCard_({
    title: T[0], subtitle: HOTEL_NAME + ' · การจอง ' + b.code,
    color: T[1], textColor: T[2],
    alt: T[0] + ' · ' + b.code + ' · ' + roomLabel_(b.roomNo) + ' · ' + lgRange_(b),
    rows: rows, buttons: buttons
  });
}

function lgDoorCard_(b) {
  const code = scRoomCode_(b.roomNo) || scCode_(b.doorCodeIssued);
  const S = SC_STAY_INFO;
  const rows = [
    { type: 'text', text: code || 'กรุณาติดต่อที่พัก', size: code ? '3xl' : 'lg', weight: 'bold',
      align: 'center', color: LG_INK_, wrap: true },
    { type: 'separator', margin: 'lg', color: '#E6DDCB' }
  ];
  if (S.wifiName) {
    rows.push(lineRow_('Wi-Fi', S.wifiName));
    if (S.wifiPassword) rows.push(lineRow_('รหัส Wi-Fi', S.wifiPassword));
  }
  rows.push(lineRow_('เช็คเอาท์', 'ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น. · ' + thShort_(strDate_(b.checkOut))));
  rows.push(lineRow_('ติดต่อ', scContact_()));
  rows.push({ type: 'text', text: 'กรุณาอย่าส่งต่อรหัสนี้ให้ผู้อื่น', size: 'xs', color: '#7A6E63', wrap: true, margin: 'md' });
  const out = lgCheckoutUrl_(b);
  return lineCard_({
    title: 'รหัสประตู' + roomLabel_(b.roomNo), subtitle: 'เข้าพักถึง ' + thShort_(strDate_(b.checkOut)) + ' · การจอง ' + b.code,
    color: LG_DARK_, textColor: LG_PAPER_,
    alt: 'รหัสประตู' + roomLabel_(b.roomNo) + ' (เปิดแชทเพื่อดูรหัส)',   // ไม่ใส่รหัสในข้อความแจ้งเตือนบนหน้าจอล็อก
    rows: rows,
    buttons: out ? [{ label: 'เช็คเอาท์', uri: out, primary: true, color: LG_BROWN_ }] : []
  });
}

function lgCheckoutCard_(b) {
  const out = lgCheckoutUrl_(b);
  return lineCard_({
    title: 'เช็คเอาท์ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น.', subtitle: thShort_(strDate_(b.checkOut)) + ' · ' + roomLabel_(b.roomNo),
    color: LG_BROWN_, textColor: '#FFFFFF',
    alt: 'เช็คเอาท์ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น. · ' + roomLabel_(b.roomNo),
    rows: [
      lineRow_('รหัส', String(b.code)),
      lineRow_('ก่อนออก', 'เก็บของใช้ของคุณและน้อง ๆ ให้ครบ · ปิดแอร์ ไฟ และน้ำ · ปิดประตูให้สนิท'),
      lineRow_('หมายเหตุ', 'ถ้าไม่ได้กดเช็คเอาท์ ระบบจะเช็คเอาท์ให้อัตโนมัติเวลา ' + AUTO_CHECKOUT_HOUR + ':00 น.')
    ],
    buttons: out ? [{ label: 'เช็คเอาท์', uri: out, primary: true, color: LG_BROWN_ }] : []
  });
}

/* =========================================================
 * แจ้งเตือนลูกค้าทาง LINE (push)
 * ========================================================= */

/** ส่งข้อความถึงทุกบัญชี LINE ที่เชื่อมกับการจองนี้ คืนจำนวนที่ส่งสำเร็จ */
function lgPushBooking_(bookingId, messages) {
  if (!LG_NOTIFY || !messages || !messages.length) return 0;
  const seen = {};
  const ids = lgLinks_().filter(r => String(r.bookingId) === String(bookingId))
    .map(r => String(r.userId)).filter(u => u && !seen[u] && (seen[u] = true));
  return ids.reduce((n, to) => n + (lineRequest_('push', { to: to, messages: messages.slice(0, 5) }).ok ? 1 : 0), 0);
}

function lgRaw_(id) {
  return readTable_('bookings').find(x => String(x.id) === String(id)) || null;
}

/** อนุมัติ/ยกเลิกการจองโดยแอดมิน (แดชบอร์ดหรือปุ่มใน LINE) */
(function () {
  const orig = changeStatus_;
  changeStatus_ = function (id, status, actor) {
    const pb = orig(id, status, actor);
    if (status === 'confirmed' || status === 'cancelled') {
      try {
        const b = lgRaw_(id);
        if (b && status === 'confirmed') {
          lgPushBooking_(id, [lgText_('ยืนยันการจอง ' + b.code + ' เรียบร้อย แล้วพบกันที่ ' + HOTEL_NAME), lgStatusCard_(b)]);
        }
        if (b && status === 'cancelled') {
          lgPushBooking_(id, [lgText_('การจอง ' + b.code + ' ถูกยกเลิกแล้ว หากชำระเงินไปแล้วหรือมีข้อสงสัย กรุณาติดต่อ' + scContact_())]);
        }
      } catch (e) { console.error('LINE guest status: ' + e); }
    }
    return pb;
  };
})();

/** หลังเช็คอินด้วยตัวเอง: ส่งรหัสประตูเข้า LINE ด้วย */
function lgAfterCheckin_(code, wasIn) {
  if (wasIn) return;
  try {
    const c = String(code || '').trim().toUpperCase();
    const b = readTable_('bookings').find(x => String(x.code).trim().toUpperCase() === c);
    if (b && String(b.status) === 'checked_in') {
      lgPushBooking_(b.id, [lgText_('เช็คอิน ' + b.code + ' เรียบร้อย ยินดีต้อนรับสู่ ' + HOTEL_NAME +
        '\nกดเมนู "รับรหัสประตู" ด้านล่างแชท เพื่อรับรหัสเข้าห้อง')]);
    }
  } catch (e) { console.error('LINE guest checkin: ' + e); }
}

function lgWasIn_(code, phone) {
  try {
    const c = String(code || '').trim().toUpperCase();
    const b = readTable_('bookings').find(x => String(x.code).trim().toUpperCase() === c && samePhone_(x.phone, normPhone_(phone)));
    return !!b && String(b.status) === 'checked_in';
  } catch (e) { return false; }
}

(function () {
  const orig = API_ACTIONS.publicSelfCheckin;
  if (!orig) return;
  API_ACTIONS.publicSelfCheckin = function (code, phone, data) {
    const wasIn = lgWasIn_(code, phone);
    const info = orig(code, phone, data);
    lgAfterCheckin_(info && info.code, wasIn);
    return info;
  };
})();

/**
 * เช็คอินด่วน (Extras.gs): เดิมให้รหัสประตูโดยไม่ต้องยืนยันบัตร
 * ตอนนี้ ถ้า LG_REQUIRE_ID = true จะใช้ได้เฉพาะดูรหัสของการจองที่เช็คอินแล้ว
 * การจองที่ยังไม่เช็คอินต้องกรอกเลขบัตรและแนบรูปบัตรผ่าน publicSelfCheckin
 */
(function () {
  const orig = API_ACTIONS.publicQuickCheckin;
  if (!orig) return;
  API_ACTIONS.publicQuickCheckin = function (code, phone) {
    scEnsure_();
    const b = scFind_(code, phone);
    const st = scState_(b);                       // ตรวจวันเข้าพักและห้องว่าง (แขกคนก่อนเช็คเอาท์แล้ว) ก่อนเสมอ
    if (st.step === 'in') return scInfo_(b);
    if (st.step !== 'open') throw new Error(st.reason || 'ยังเช็คอินด้วยตัวเองไม่ได้');
    if (!LG_REQUIRE_ID) {
      const info = orig(code, phone);
      lgAfterCheckin_(info && info.code, false);
      return info;
    }
    throw new Error('ก่อนรับรหัสประตู กรุณากรอกเลขบัตรและแนบรูปบัตรประชาชนหรือพาสปอร์ต เพื่อลงทะเบียนผู้เข้าพักตามกฎหมาย');
  };
})();

/** หลังเช็คเอาท์ทุกแบบ (อัตโนมัติ ลูกค้ากดเอง แอดมินกด): ขอบคุณทาง LINE */
(function () {
  if (typeof logCheckout_ !== 'function') return;
  const orig = logCheckout_;
  logCheckout_ = function (pb, method, x) {
    orig(pb, method, x);
    if (!LG_THANKS) return;
    try {
      lgPushBooking_(pb.id, [lgText_('เช็คเอาท์ ' + pb.code + ' เรียบร้อยแล้ว ขอบคุณที่มาพักกับ ' + HOTEL_NAME +
        '\nหวังว่าจะได้ต้อนรับคุณและน้อง ๆ อีกครั้ง')]);
    } catch (e) { console.error('LINE guest thanks: ' + e); }
    try { lgHourly(); } catch (e) { console.error('LINE guest room ready: ' + e); }   // แจ้งแขกคนถัดไปว่าห้องพร้อมทันที
  };
})();

/* =========================================================
 * เช็คอินได้เมื่อไร
 *   - เอาการล็อกเวลา SC_CHECKIN_HOUR ออก (LG_CHECKIN_ANYTIME): เช็คอินได้ตั้งแต่เช้าวันเข้าพัก
 *   - แต่ถ้าแขกคนก่อนในห้องเดียวกันยังไม่เช็คเอาท์ จะยังเช็คอินไม่ได้ (step = 'busy' พร้อม LG_ROOM_BUSY_MSG)
 *   ใช้กับทุกช่องทาง: หน้าเช็คอิน, ระบบหลังบ้าน (publicSelfCheckin / publicQuickCheckin) และ LINE
 * ========================================================= */
function lgCheckinWhen_() {
  return LG_CHECKIN_ANYTIME ? 'ในวันเข้าพัก เมื่อห้องพร้อม' : 'ตั้งแต่ ' + SC_CHECKIN_HOUR + ':00 น. ของวันเข้าพัก';
}

/** แขกคนก่อนยังอยู่ในห้องนี้หรือไม่ (เช็คอินแล้วแต่ยังไม่เช็คเอาท์ หรือยืนยันแล้วและเช็คเอาท์วันนี้) */
function lgRoomBusy_(b) {
  const today = today_();
  return readTable_('bookings').some(x => {
    if (String(x.id) === String(b.id) || String(x.roomNo).trim() !== String(b.roomNo).trim()) return false;
    const st = String(x.status);
    if (st === 'checked_in') return true;
    return st === 'confirmed' && strDate_(x.checkIn) < today && strDate_(x.checkOut) >= today;
  });
}

(function () {
  const orig = scState_;
  scState_ = function (b) {
    let st = orig(b);
    if (st.step === 'early' && LG_CHECKIN_ANYTIME) {
      if (today_() >= strDate_(b.checkIn)) st = { step: 'open' };
      else st = { step: 'early', reason: 'เช็คอินด้วยตัวเองได้ในวันที่ ' + thLong_(strDate_(b.checkIn)) };
    }
    if (st.step === 'open' && lgRoomBusy_(b)) st = { step: 'busy', reason: LG_ROOM_BUSY_MSG };
    return st;
  };
})();

/**
 * trigger ทุกชั่วโมง (ติดตั้งด้วย setupLineGuest)
 *   - 1 วันก่อนเช็คอิน ตั้งแต่ LG_REMIND_HOUR: เตือนวันเข้าพัก
 *   - วันเช็คอิน เมื่อห้องว่างแล้ว (และตั้งแต่ LG_REMIND_HOUR): ห้องพร้อมแล้ว พร้อมปุ่มไปหน้าเช็คอิน
 *   - เช้าวันเช็คเอาท์ ตั้งแต่ LG_REMIND_HOUR ถึงก่อน AUTO_CHECKOUT_HOUR: เตือนเช็คเอาท์
 *   ส่งครั้งเดียวต่อเรื่อง (บันทึกในคอลัมน์ notified ผูกกับวันที่ เลื่อนวันพักแล้วจะเตือนใหม่)
 *   ตี 3: ลบการเชื่อมของการจองที่จบไปแล้วเกิน LG_KEEP_DAYS วัน
 */
function lgHourly() {
  const hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  if (hour === 3) { try { lgPurge_(); } catch (e) { console.error('LINE guest purge: ' + e); } }
  if (!LG_NOTIFY || !lineProps_().token) return 0;
  const links = lgLinks_();
  if (!links.length) return 0;
  const today = today_(), tomorrow = addDays_(today, 1);
  const byId = {};
  readTable_('bookings').forEach(b => byId[String(b.id)] = b);

  const done = [];
  links.forEach(l => {
    const b = byId[String(l.bookingId)];
    if (!b) return;
    const st = String(b.status), ci = strDate_(b.checkIn), co = strDate_(b.checkOut);
    let key = '';
    if (st === 'confirmed' && ci === tomorrow && hour >= LG_REMIND_HOUR) key = 'r1:' + ci;
    else if (st === 'confirmed' && ci === today && hour >= (LG_CHECKIN_ANYTIME ? LG_REMIND_HOUR : SC_CHECKIN_HOUR) &&
             scState_(b).step === 'open') key = 'open:' + ci;
    else if (st === 'checked_in' && co === today && hour >= LG_REMIND_HOUR && hour < AUTO_CHECKOUT_HOUR) key = 'out:' + co;
    const sent = String(l.notified || '').split(',').filter(String);
    if (!key || sent.indexOf(key) >= 0) return;
    lineRequest_('push', { to: String(l.userId), messages: lgNotice_(key.split(':')[0], b) });
    done.push({ id: String(l.id), key: key });   // บันทึกแม้ส่งไม่สำเร็จ (เช่น ลูกค้าบล็อก OA) กันส่งซ้ำทุกชั่วโมง
  });
  if (done.length) {
    withLock_(() => {
      const rows = lgLinks_();
      done.forEach(d => {
        const r = rows.find(x => String(x.id) === d.id);
        if (!r) return;
        const list = String(r.notified || '').split(',').filter(String).slice(-10);
        list.push(d.key);
        r.notified = list.join(',');
        setCell_('lineGuests', r._row, 'notified', r.notified);
      });
    });
  }
  return done.length;
}

function lgNotice_(type, b) {
  if (type === 'r1') {
    return [lineCard_({
      title: 'พรุ่งนี้พบกันที่ ' + HOTEL_NAME, subtitle: 'การจอง ' + b.code,
      color: LG_BLUE_, textColor: LG_PAPER_,
      alt: 'พรุ่งนี้เช็คอิน · ' + roomLabel_(b.roomNo) + ' · ' + HOTEL_NAME,
      rows: lgBaseRows_(b).concat([
        lineRow_('เตรียม', LG_REQUIRE_ID ? 'บัตรประชาชนหรือพาสปอร์ต · สมุดวัคซีนของน้อง ๆ' : 'สมุดวัคซีนของน้อง ๆ'),
        lineRow_('วิธีเช็คอิน', 'เมื่อห้องพร้อม ระบบจะส่งปุ่มเช็คอินมาที่แชทนี้ ' + lgHowCheckin_() + ' แล้วกดเมนู "รับรหัสประตู"')
      ])
    })];
  }
  if (type === 'open') {
    return [lgText_('ห้องพักพร้อมแล้ว เช็คอินได้เลย กดปุ่มด้านล่าง ' + lgHowCheckin_() + ' แล้วกดเมนู "รับรหัสประตู" เพื่อดูรหัสประตู'), lgStatusCard_(b)];
  }
  return [lgCheckoutCard_(b)];
}

/** วิธีเช็คอินบนหน้าเว็บ ตามการตั้งค่า LG_REQUIRE_ID */
function lgHowCheckin_() {
  return LG_REQUIRE_ID ? 'กรอกเลขบัตรและถ่ายรูปบัตรในหน้าเช็คอิน' : 'กรอกรหัสการจองและเบอร์โทรในหน้าเช็คอิน';
}

function lgPurge_() {
  const links = lgLinks_();
  if (!links.length) return 0;
  const byId = {};
  readTable_('bookings').forEach(b => byId[String(b.id)] = b);
  const cutoff = addDays_(today_(), -LG_KEEP_DAYS);
  const dead = {};
  links.forEach(l => {
    const b = byId[String(l.bookingId)];
    if (!b || (['checked_out', 'cancelled'].indexOf(String(b.status)) >= 0 && strDate_(b.checkOut) < cutoff)) dead[String(l.id)] = true;
  });
  if (!Object.keys(dead).length) return 0;
  const n = withLock_(() => {
    const rows = lgLinks_().filter(r => dead[String(r.id)]).sort((a, b) => b._row - a._row);
    rows.forEach(r => sheet_('lineGuests').deleteRow(r._row));
    return rows.length;
  });
  Logger.log('ลบการเชื่อม LINE ที่หมดอายุแล้ว ' + n + ' รายการ');
  return n;
}

/* =========================================================
 * ข้อมูลที่ส่งให้หน้าเว็บ
 * ========================================================= */

/** หน้าเช็คอิน: บอกจำนวนวันเก็บรูปบัตร และสถานะการเชื่อม LINE ของการจองนี้ */
(function () {
  const orig = scInfo_;
  scInfo_ = function (b) {
    const out = orig(b);
    if (!LG_DOOR_ON_WEB && out.stay) out.stay.doorCode = '';   // หน้าเว็บไม่เห็นรหัสประตู
    out.requireId = LG_REQUIRE_ID;                              // หน้าเช็คอินแสดงฟอร์มบัตรหรือไม่
    out.keepIdDays = SC_KEEP_ID_DAYS;
    try {
      const p = lgPublicLine_();
      out.line = { ready: p.ready, chatUrl: p.chatUrl,
                   linked: p.ready ? lgLinks_().filter(r => String(r.bookingId) === String(b.id)).length : 0 };
    } catch (e) { out.line = { ready: false, chatUrl: '', linked: 0 }; }
    return out;
  };
})();

/** รหัสประตูทาง LINE เท่านั้น: ปิดอีเมลรหัสประตูหลังเช็คอิน และแก้ข้อความในอีเมลเตือนก่อนเช็คอิน */
(function () {
  if (LG_DOOR_ON_WEB) return;
  if (typeof scMailDoorCode_ === 'function') scMailDoorCode_ = function () {};
  if (typeof guestReminderHtml_ === 'function') {
    const orig = guestReminderHtml_;
    guestReminderHtml_ = function (b) {
      return orig(b).replace('ถ่ายรูปบัตรแล้วรับรหัสประตูได้ทันทีที่', (LG_REQUIRE_ID ? 'ถ่ายรูปบัตร ' : 'กรอกรหัสการจองและเบอร์โทร ') +
        'แล้วรับรหัสประตูทาง LINE ของ ' + HOTEL_NAME + ' (กดเมนู "รับรหัสประตู") เช็คอินได้ที่');
    };
  }
})();

/** หน้าจอง: แสดงปุ่ม "เชื่อมกับ LINE" เมื่อระบบพร้อม */
(function () {
  const orig = publicGetConfig;
  publicGetConfig = function () {
    const c = orig();
    try { c.line = lgPublicLine_(); } catch (e) { c.line = { ready: false, chatUrl: '' }; }
    return c;
  };
  API_ACTIONS.publicGetConfig = publicGetConfig;
})();

Object.assign(API_ACTIONS, { publicLineLink: publicLineLink });
