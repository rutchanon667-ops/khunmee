/**********************************************************
 * Khun Mhee: รหัสเข้าล็อบบี้รายการจอง (LobbyCode.gs)
 * ใช้กับกลอนดิจิทัลที่ประตูล็อบบี้ประตูเดียว (เช่น Häfele PP9100) ห้องพักไม่ใช้รหัส
 *
 * แนวคิด
 *   - ทุกการจองได้รหัส 6 หลักของตัวเอง ใช้ "ช่องผู้ใช้" ในกลอนคนละช่อง
 *   - ห้องละ 2 ช่องสลับกัน (ค่าเริ่มต้น ห้องที่ 1 = ช่อง 11/21, ห้องที่ 2 = 12/22 …)
 *     แขกคนใหม่จึงได้รหัสก่อนแขกคนเก่าออก โดยไม่ต้องลบรหัสของคนเก่า
 *   - ระบบสุ่มรหัสให้ก่อนวันเข้าพัก LC_PREP_DAYS วัน แล้วส่งงานให้แอดมินทาง LINE
 *       "ตั้งรหัส 482915 ที่ช่อง 21"  → แอดมินตั้งในกลอน → กดปุ่ม [ตั้งในกลอนแล้ว]
 *   - แขกเช็คเอาท์ / ยกเลิก / เลื่อนวัน → ส่งงาน "ลบรหัสช่อง 11" → แอดมินลบในกลอน → กด [ลบแล้ว]
 *   - แขกได้รหัสเมื่อกดเมนู "รับรหัสประตู" ใน LINE หลังเช็คอินแล้ว (LC_AFTER_CHECKIN_ONLY) และแอดมินกดยืนยันว่าตั้งแล้ว
 *     ถ้าห้องยังไม่พร้อม (แขกคนก่อนยังไม่เช็คเอาท์) แขกจะเช็คอินไม่ได้และได้ข้อความให้โทรหาเจ้าหน้าที่
 *   - แอดมินพิมพ์ "งานล็อบบี้" ในแชท LINE ที่ลงทะเบียนแอดมินไว้ เพื่อดูงานที่ค้าง
 *   - ใช้รหัสของแอดมินเองแทนรหัสที่ระบบสุ่ม: ตั้งรหัสในกลอนก่อน แล้วพิมพ์ใน LINE
 *       ล็อบบี้ 21 482915          (ช่องในกลอน ตามด้วยรหัส 6–8 หลัก)
 *       ล็อบบี้ KM261111BBBB 482915 (หรือใช้รหัสการจองแทนช่อง)
 *     หรือกดปุ่ม [ใส่รหัสเอง] ในการ์ดงาน แป้นพิมพ์จะเปิดพร้อมคำสั่ง "ล็อบบี้ 21 " ให้พิมพ์รหัสต่อท้ายแล้วส่ง
 *     ใช้เปลี่ยนรหัสที่ใช้งานอยู่ได้ด้วย (เช่น แขกทำรหัสหลุด) ระบบแจ้งแขกให้กดเมนูรับรหัสใหม่
 *
 * ติดตั้ง
 *   1) Apps Script กด + → Script ตั้งชื่อ LobbyCode แล้ววางโค้ดทั้งไฟล์นี้
 *      ไฟล์นี้ต้องอยู่ "ล่างสุด" (ใต้ LineGuest.gs)
 *   2) แก้ค่าในส่วน "ตั้งค่า" ด้านล่าง โดยเฉพาะ LC_ROOM_NOTE (วิธีเข้าห้องพัก)
 *   3) เลือกฟังก์ชัน setupLobbyCodes แล้วกด Run 1 ครั้ง (สร้างแท็บ LobbyCodes และตรวจงานทุกชั่วโมง)
 *   4) Deploy → Manage deployments → แก้ไข → Version: New version แล้วกด Deploy
 *   ในกลอน: ตั้งแอดมินและพนักงานในช่อง 01–09 (ลายนิ้วมือ/บัตร) ช่อง 11–19 และ 21–29 ให้ระบบใช้
 *
 * แท็บใหม่ LobbyCodes: 1 แถวต่อ 1 รหัส
 *   status: pending (รอแอดมินตั้งในกลอน) → active (ใช้งานได้) → remove (รอแอดมินลบ) → removed
 *   แก้รหัสเองได้ที่คอลัมน์ pin ก่อนกด "ตั้งในกลอนแล้ว" (ต้องเป็นตัวเลข 6–8 หลัก)
 **********************************************************/

/***** ตั้งค่า *****/
const LC_ENABLED = true;               // false = กลับไปใช้รหัสประตูรายห้อง (คอลัมน์ doorCode ในแท็บ Rooms) แบบเดิม
const LC_PREP_DAYS = 1;                // สุ่มรหัสและส่งงานให้แอดมินก่อนวันเข้าพักกี่วัน
const LC_PIN_LENGTH = 6;               // ความยาวรหัส (PP9100 รับ 6–8 หลัก)
const LC_SLOTS = {};                   // กำหนดช่องเองได้ เช่น { '1': [11, 21], '2': [12, 22] } ว่าง = ห้องที่ n ใช้ช่อง 10+n และ 20+n
const LC_REMIND_HOURS = 3;             // งานค้างนานกี่ชั่วโมงแล้วเตือนแอดมินอีกครั้ง (เตือนซ้ำครั้งเดียว)
const LC_ROOM_NOTE = 'ประตูห้องพักไม่ได้ล็อก กุญแจห้องวางไว้บนโต๊ะในห้อง';   // บอกแขกหลังเช็คอินว่าเข้าห้องอย่างไร
const LC_KEYPAD_NOTE = 'แตะหน้าจอกลอนให้ไฟติด กดรหัส แล้วกดปุ่มยืนยัน';      // วิธีกดรหัสที่กลอน (ว่าง = ไม่แสดง)
const LC_AFTER_CHECKIN_ONLY = true;    // แขกขอรหัสล็อบบี้ได้หลังเช็คอินแล้วเท่านั้น
// เวลาที่คาดว่าจะมาถึง (ลูกค้าเลือกในหน้าจอง ขั้นข้อมูลผู้เข้าพัก) แสดงให้แอดมินดูอย่างเดียว ไม่มีผลกับการออกรหัส
const LC_ARRIVAL_SLOTS = ['14:00–16:00', '16:00–18:00', '18:00–20:00', '20:00–22:00', 'หลัง 22:00'];

SHEETS.lobbyCodes = {
  name: 'LobbyCodes',
  headers: ['id', 'bookingId', 'code', 'roomNo', 'guestName', 'checkIn', 'checkOut', 'slot', 'pin', 'status',
            'createdAt', 'setAt', 'setBy', 'removeAt', 'removedAt', 'removedBy', 'notified']
};
const LC_OPEN_ = ['pending', 'active'];             // รหัสที่ยังเป็นของการจองนั้น
const LC_STATUS_TH_ = { pending: 'รอตั้งในกลอน', active: 'ใช้งานได้', remove: 'รอลบจากกลอน', removed: 'ลบแล้ว' };

/* =========================================================
 * ติดตั้ง
 * ========================================================= */
function setupLobbyCodes() {
  const sh = lcSheet_();
  sh.getRange(2, SHEETS.lobbyCodes.headers.indexOf('pin') + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'lcHourly')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lcHourly').timeBased().everyHours(1).create();
  const map = readRooms_().filter(r => r.status === 'active')
    .map(r => roomLabel_(r.roomNo) + ' → ช่อง ' + lcSlotsFor_(r.roomNo).join(' / ')).join('\n');
  Logger.log('ติดตั้งรหัสเข้าล็อบบี้แล้ว: แท็บ LobbyCodes และตรวจงานทุกชั่วโมง (lcHourly)');
  Logger.log('ช่องผู้ใช้ในกลอนล็อบบี้ที่ระบบใช้:\n' + map);
  if (!lineProps_().ids.length) Logger.log('ยังไม่มีแอดมินลงทะเบียน LINE: พิมพ์ "แอดมิน <รหัส>" ในแชท OA ก่อน ไม่อย่างนั้นจะไม่ได้รับงานตั้ง/ลบรหัส');
  const n = lcSweep_();
  Logger.log('สร้างงานแล้ว ' + n + ' รายการ · อย่าลืม Deploy → Manage deployments → New version');
}

function lcSheet_() {
  const def = SHEETS.lobbyCodes;
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

function lcRows_() {
  try { return readTable_('lobbyCodes'); } catch (e) { return []; }
}

function lcPin_(r) { return scCode_(r && r.pin); }

/** บันทึกแถวกลับลงชีต (รหัส ห้อง และวันที่เก็บเป็นข้อความ เลข 0 ข้างหน้าไม่หาย) */
function lcWrite_(r) {
  const o = Object.assign({}, r);
  ['pin', 'roomNo', 'checkIn', 'checkOut'].forEach(k => {
    const v = k === 'checkIn' || k === 'checkOut' ? strDate_(o[k]) : scCode_(o[k]);
    o[k] = v ? "'" + v : '';
  });
  writeRow_('lobbyCodes', o);
}

/** ช่องผู้ใช้ในกลอนของห้องนี้ [ช่องที่ 1, ช่องที่ 2] */
function lcSlotsFor_(roomNo) {
  const key = String(roomNo).trim();
  if (LC_SLOTS[key] && LC_SLOTS[key].length) return LC_SLOTS[key].map(String);
  const rooms = readRooms_();
  let i = rooms.findIndex(r => r.roomNo === key) + 1;
  if (!i) i = Math.max(1, Math.min(9, Number(key) || 1));
  return [String(10 + i), String(20 + i)];
}

/** สุ่มรหัสที่ไม่ง่ายเกินไป และไม่ซ้ำกับรหัสที่ยังอยู่ในกลอน */
function lcNewPin_(rows) {
  const used = {};
  rows.forEach(r => { if (['pending', 'active', 'remove'].indexOf(String(r.status)) >= 0) used[lcPin_(r)] = true; });
  const len = Math.max(6, Math.min(8, LC_PIN_LENGTH));
  for (let n = 0; n < 200; n++) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    if (used[s] || /^(\d)\1+$/.test(s)) continue;                       // 111111
    if ('01234567890'.indexOf(s) >= 0 || '09876543210'.indexOf(s) >= 0) continue;   // เรียงกัน
    if (/(\d)\1\1/.test(s)) continue;                                   // เลขซ้ำติดกัน 3 ตัว
    return s;
  }
  throw new Error('สุ่มรหัสล็อบบี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
}

/** การจองที่ควรมีรหัสล็อบบี้ตอนนี้ */
function lcWants_(b, today) {
  const st = String(b.status);
  if (st !== 'confirmed' && st !== 'checked_in') return false;
  const ci = strDate_(b.checkIn), co = strDate_(b.checkOut);
  return isDate_(ci) && isDate_(co) && ci <= addDays_(today, LC_PREP_DAYS) && co >= today;
}

/* =========================================================
 * ตรวจงานทั้งหมด: สร้างรหัสใหม่ · ปิดรหัสที่หมดสิทธิ์ · ส่งงานให้แอดมิน
 * เรียกทุกชั่วโมง และทุกครั้งที่สถานะการจองเปลี่ยน
 * ========================================================= */
function lcHourly() { return lcSweep_(); }

function lcSweepSafe_() {
  if (!LC_ENABLED) return 0;
  try { return lcSweep_(); } catch (e) { console.error('Lobby code sweep: ' + e); return 0; }
}

function lcSweep_() {
  if (!LC_ENABLED) return 0;
  lcSheet_();
  const today = today_();
  const hour = Number(Utilities.formatDate(new Date(), tz_(), 'H'));
  const now = new Date();
  const toAdmin = [];

  withLock_(() => {
    const rows = lcRows_();
    const byId = {};
    readTable_('bookings').forEach(b => byId[String(b.id)] = b);

    // 1) รหัสที่ยังเปิดอยู่แต่การจองจบแล้ว / ยกเลิก / เลื่อนออกไป → ส่งงานลบ, ที่ยังใช้อยู่ → อัปเดตวันที่
    rows.forEach(r => {
      if (LC_OPEN_.indexOf(String(r.status)) < 0) return;
      const b = byId[String(r.bookingId)];
      if (!b || !lcWants_(b, today) || String(b.roomNo).trim() !== String(r.roomNo).replace(/^'/, '').trim()) {
        r.status = 'remove';
        r.removeAt = now;
        lcWrite_(r);
        return;
      }
      const ci = strDate_(b.checkIn), co = strDate_(b.checkOut);
      if (strDate_(r.checkIn) !== ci || strDate_(r.checkOut) !== co) {
        r.checkIn = "'" + ci;
        r.checkOut = "'" + co;
        lcWrite_(r);
      }
    });

    // 2) การจองที่ใกล้วันเข้าพักแต่ยังไม่มีรหัส → สุ่มรหัสและจองช่อง
    Object.keys(byId).map(k => byId[k])
      .filter(b => lcWants_(b, today))
      .sort((a, b) => strDate_(a.checkIn).localeCompare(strDate_(b.checkIn)))
      .forEach(b => {
        if (rows.some(r => String(r.bookingId) === String(b.id) && LC_OPEN_.indexOf(String(r.status)) >= 0)) return;
        const slots = lcSlotsFor_(b.roomNo);
        const busy = s => rows.some(r => String(r.slot) === s && LC_OPEN_.indexOf(String(r.status)) >= 0);
        const waiting = s => rows.some(r => String(r.slot) === s && String(r.status) === 'remove');
        const slot = slots.find(s => !busy(s) && !waiting(s)) || slots.find(s => !busy(s));
        if (!slot) return;   // ทั้ง 2 ช่องยังมีแขกใช้อยู่ รอรอบถัดไป (หลังแขกคนก่อนเช็คเอาท์)
        const r = {
          id: Utilities.getUuid(), bookingId: String(b.id), code: String(b.code), roomNo: "'" + String(b.roomNo).trim(),
          guestName: safe_(unsafe_(b.guestName)), checkIn: "'" + strDate_(b.checkIn), checkOut: "'" + strDate_(b.checkOut),
          slot: slot, pin: "'" + lcNewPin_(rows), status: 'pending', createdAt: now,
          setAt: '', setBy: '', removeAt: '', removedAt: '', removedBy: '', notified: ''
        };
        lcSheet_().appendRow(SHEETS.lobbyCodes.headers.map(h => r[h] === undefined ? '' : r[h]));
        r.pin = r.pin.slice(1); r.roomNo = r.roomNo.slice(1); r.checkIn = r.checkIn.slice(1); r.checkOut = r.checkOut.slice(1);
        rows.push(Object.assign(r, { _row: lcSheet_().getLastRow(), _new: true }));
      });

    // 3) งานที่ต้องแจ้งแอดมิน (ครั้งแรก และเตือนซ้ำ 1 ครั้งถ้าค้างนาน)
    rows.forEach(r => {
      const sent = String(r.notified || '').split(',').filter(String);
      const st = String(r.status);
      const ci = strDate_(r.checkIn);
      const age = h => (now - (r[h] instanceof Date ? r[h] : now)) / 3600000;
      let key = '';
      if (st === 'pending' && sent.indexOf('set') < 0) key = 'set';
      else if (st === 'pending' && sent.indexOf('set2') < 0 && ci <= today && hour >= LG_REMIND_HOUR && age('createdAt') >= LC_REMIND_HOURS) key = 'set2';
      else if (st === 'remove' && sent.indexOf('del') < 0) key = 'del';
      else if (st === 'remove' && sent.indexOf('del2') < 0 && age('removeAt') >= LC_REMIND_HOURS) key = 'del2';
      if (!key) return;
      if (st === 'remove' && sent.indexOf('set') < 0 && !r.setAt) {   // ยังไม่เคยแจ้งให้ตั้ง = ไม่มีอะไรอยู่ในกลอน ปิดเงียบ ๆ
        r.status = 'removed'; r.removedAt = now; r.removedBy = 'ระบบ (ยังไม่เคยตั้งในกลอน)';
        lcWrite_(r);
        return;
      }
      sent.push(key);
      r.notified = sent.join(',');
      lcWrite_(r);
      toAdmin.push({ r: Object.assign({}, r), key: key, arrival: lcArrivalText_((byId[String(r.bookingId)] || {}).arrivalTime) });
    });
  });

  if (toAdmin.length) {
    const cards = toAdmin.map(x => lcAdminCard_(x.r, x.key, x.arrival));
    for (let i = 0; i < cards.length; i += 5) {
      try { linePushAdmins_(cards.slice(i, i + 5)); } catch (e) { console.error('LINE lobby admin: ' + e); }
    }
  }
  return toAdmin.length;
}

/* =========================================================
 * การ์ดงานของแอดมิน
 * ========================================================= */
function lcAdminCard_(r, key, arrival) {
  const pin = lcPin_(r);
  if (arrival === undefined) arrival = lcArrivalOf_(r.bookingId);
  const remind = key === 'set2' || key === 'del2';
  const roomNo = String(r.roomNo).replace(/^'/, '');
  if (key === 'set' || key === 'set2') {
    const card = lineCard_({
      title: (remind ? '⏰ ยังไม่ได้ตั้ง · ' : '') + 'ตั้งรหัสล็อบบี้ ช่อง ' + r.slot,
      subtitle: roomLabel_(roomNo) + ' · เข้าพัก ' + thShort_(strDate_(r.checkIn)),
      color: LG_GREEN_, textColor: LG_PAPER_,
      alt: 'ตั้งรหัสล็อบบี้ช่อง ' + r.slot + ' · ' + roomLabel_(roomNo) + ' · ' + unsafe_(r.guestName),
      rows: [
        { type: 'text', text: pin, size: '3xl', weight: 'bold', align: 'center', color: LG_INK_ },
        { type: 'separator', margin: 'lg', color: '#E6DDCB' },
        lineRow_('ช่องในกลอน', 'ผู้ใช้หมายเลข ' + r.slot + ' (ตั้งเป็นรหัสผ่าน)'),
        lineRow_('แขก', unsafe_(r.guestName) + ' · ' + r.code),
        lineRow_('เข้าพัก', thShort_(strDate_(r.checkIn)) + ' – ' + thShort_(strDate_(r.checkOut))),
        lineRow_('มาถึงประมาณ', arrival || 'ไม่ได้ระบุ'),
        lineRow_('ใช้รหัสนี้', 'ตั้งรหัสนี้ในกลอน ทดสอบกด 1 ครั้ง แล้วกด [ตั้งในกลอนแล้ว]'),
        lineRow_('ใช้รหัสเอง', 'ตั้งรหัสที่ต้องการในกลอน แล้วกด [ใส่รหัสเอง] พิมพ์รหัสต่อท้ายแล้วส่ง'),
        { type: 'text', text: 'แขกขอรหัสได้หลังเช็คอิน และหลังแอดมินยืนยันว่าตั้งในกลอนแล้วเท่านั้น', size: 'xs', color: '#7A6E63', wrap: true, margin: 'md' }
      ],
      buttons: [
        { label: 'ตั้งในกลอนแล้ว', data: 'lc=set&id=' + r.id, primary: true, color: LG_GREEN_, group: 'set' },
        { label: 'ใส่รหัสเอง', data: 'lc=own&id=' + r.id, group: 'own' }
      ]
    });
    return lcOpenKeyboard_(card, 'lc=own', lcCmd_(r.slot));
  }
  return lineCard_({
    title: (remind ? '⏰ ยังไม่ได้ลบ · ' : '') + 'ลบรหัสล็อบบี้ ช่อง ' + r.slot,
    subtitle: roomLabel_(roomNo) + ' · ' + unsafe_(r.guestName),
    color: LG_BROWN_, textColor: '#FFFFFF',
    alt: 'ลบรหัสล็อบบี้ช่อง ' + r.slot + ' · ' + roomLabel_(roomNo),
    rows: [
      lineRow_('ช่องในกลอน', 'ผู้ใช้หมายเลข ' + r.slot),
      lineRow_('รหัสที่ลบ', pin),
      lineRow_('แขก', unsafe_(r.guestName) + ' · ' + r.code),
      lineRow_('เหตุผล', lcRemoveReason_(r)),
      lineRow_('ขั้นตอน', 'ลบผู้ใช้ช่องนี้ออกจากกลอนล็อบบี้ แล้วกดปุ่มด้านล่าง (ถ้ายังไม่เคยตั้งรหัสนี้ในกลอน กดได้เลย)')
    ],
    buttons: [{ label: 'ลบแล้ว', data: 'lc=del&id=' + r.id, primary: true, color: LG_BROWN_ }]
  });
}

/** คำสั่งตั้งรหัสเองที่เติมไว้ให้ในแป้นพิมพ์ */
function lcCmd_(slot) { return 'ล็อบบี้ ' + slot + ' '; }

/** ปุ่ม postback ที่กดแล้วเปิดแป้นพิมพ์พร้อมข้อความเริ่มต้น (LINE inputOption: openKeyboard) */
function lcOpenKeyboard_(card, prefix, fill) {
  try {
    (card.contents.footer ? card.contents.footer.contents : []).forEach(c => {
      if (c.type !== 'button' || !c.action || String(c.action.data || '').indexOf(prefix) !== 0) return;
      delete c.action.displayText;
      c.action.inputOption = 'openKeyboard';
      c.action.fillInText = fill;
    });
  } catch (e) { console.error('LINE lobby keyboard: ' + e); }
  return card;
}

function lcRemoveReason_(r) {
  const b = lgRaw_(r.bookingId);
  if (!b) return 'ไม่พบการจองแล้ว';
  const st = String(b.status);
  if (st === 'checked_out') return 'แขกเช็คเอาท์แล้ว';
  if (st === 'cancelled') return 'การจองถูกยกเลิก';
  if (strDate_(b.checkIn) > addDays_(today_(), LC_PREP_DAYS)) return 'เลื่อนวันเข้าพักเป็น ' + thShort_(strDate_(b.checkIn)) + ' (ระบบจะส่งรหัสใหม่ให้ตั้งก่อนวันเข้าพัก)';
  if (String(b.roomNo).trim() !== String(r.roomNo).replace(/^'/, '').trim()) return 'ย้ายห้อง';
  return 'หมดช่วงเข้าพัก';
}

/** แอดมินกดปุ่มในการ์ด หรือพิมพ์ "งานล็อบบี้" */
function lcIsAdmin_(src) {
  const ids = lineProps_().ids;
  return [src.userId, src.groupId, src.roomId].some(x => x && ids.indexOf(x) >= 0);
}

function lcAdminPostback_(ev, data) {
  const src = ev.source || {};
  if (!lcIsAdmin_(src)) return lineReply_(ev.replyToken, 'คุณไม่มีสิทธิ์จัดการรหัสล็อบบี้');
  const p = {};
  data.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  if (p.lc === 'own') {
    const r0 = lcRows_().find(x => String(x.id) === String(p.id));
    const slot = r0 ? r0.slot : 'ช่อง';
    return lineReply_(ev.replyToken, 'ตั้งรหัสที่ต้องการในกลอนช่อง ' + slot + ' ก่อน แล้วพิมพ์ต่อท้ายคำสั่งที่แป้นพิมพ์ แล้วกดส่ง\n' +
      'เช่น ' + lcCmd_(slot) + '482915 (ตัวเลข 6–8 หลัก)');
  }
  const who = lineDisplayName_(src) || 'แอดมิน';
  const now = new Date();
  let notifyGuest = null;
  const msg = withLock_(() => {
    const rows = lcRows_();
    const r = rows.find(x => String(x.id) === String(p.id));
    if (!r) return 'ไม่พบรายการนี้แล้ว';
    const roomNo = String(r.roomNo).replace(/^'/, '');
    if (p.lc === 'set') {
      if (String(r.status) === 'active') return 'ช่อง ' + r.slot + ' ตั้งไว้แล้ว (โดย ' + (unsafe_(r.setBy) || '-') + ')';
      if (String(r.status) !== 'pending') return 'รายการนี้ไม่ต้องตั้งแล้ว (สถานะ: ' + (LC_STATUS_TH_[r.status] || r.status) + ')';
      const pin = lcPin_(r);
      if (!/^\d{6,8}$/.test(pin)) return 'รหัสในแท็บ LobbyCodes ต้องเป็นตัวเลข 6–8 หลัก กรุณาแก้แล้วกดอีกครั้ง';
      Object.assign(r, { status: 'active', setAt: now, setBy: safe_(who) });
      lcWrite_(r);
      // รหัสเก่าในช่องเดียวกันที่รอลบ ถูกรหัสใหม่ทับแล้ว
      rows.filter(x => x.id !== r.id && String(x.slot) === String(r.slot) && String(x.status) === 'remove').forEach(x => {
        Object.assign(x, { status: 'removed', removedAt: now, removedBy: safe_('ทับด้วยรหัสใหม่ · ' + who) });
        lcWrite_(x);
      });
      notifyGuest = r.bookingId;
      return '✅ ตั้งรหัสล็อบบี้ช่อง ' + r.slot + ' แล้ว · ' + roomLabel_(roomNo) + ' · ' + unsafe_(r.guestName) +
        '\n' + lcGuestWhen_(r);
    }
    if (p.lc === 'del') {
      if (String(r.status) === 'removed') return 'ช่อง ' + r.slot + ' ลบไปแล้ว';
      if (String(r.status) !== 'remove') return 'รหัสนี้ยังใช้งานอยู่ ยังไม่ต้องลบ';
      Object.assign(r, { status: 'removed', removedAt: now, removedBy: safe_(who) });
      lcWrite_(r);
      return '🗑 ลบรหัสล็อบบี้ช่อง ' + r.slot + ' แล้ว · ' + roomLabel_(roomNo);
    }
    return 'ไม่รู้จักคำสั่ง';
  });
  lineReply_(ev.replyToken, msg);
  if (notifyGuest) lcNotifyGuest_(notifyGuest, false);
}

/** ข้อความบอกแอดมินว่าแขกจะได้รหัสเมื่อไร */
function lcGuestWhen_(r) {
  return LC_AFTER_CHECKIN_ONLY
    ? 'แขกกดเมนู "รับรหัสประตู" ได้หลังเช็คอิน (ตั้งแต่ ' + thShort_(strDate_(r.checkIn)) + ')'
    : 'แขกกดเมนู "รับรหัสประตู" ได้ตั้งแต่ ' + thShort_(strDate_(r.checkIn));
}

/** บอกแขกว่ารหัสพร้อม/เปลี่ยนแล้ว เฉพาะแขกที่ขอรหัสได้แล้ว (เช็คอินแล้ว หรือถึงวันเข้าพักถ้าไม่บังคับเช็คอิน) */
function lcNotifyGuest_(bookingId, changed) {
  try {
    const b = readTable_('bookings').find(x => String(x.id) === String(bookingId));
    if (!b) return;
    const ok = LC_AFTER_CHECKIN_ONLY ? String(b.status) === 'checked_in'
      : strDate_(b.checkIn) <= today_() && ['confirmed', 'checked_in'].indexOf(String(b.status)) >= 0;
    if (!ok) return;
    lgPushBooking_(b.id, [lgText_(changed
      ? 'รหัสเข้าล็อบบี้ของคุณเปลี่ยนแล้ว กดเมนู "รับรหัสประตู" ด้านล่างแชทเพื่อดูรหัสใหม่'
      : 'รหัสเข้าล็อบบี้ของคุณพร้อมแล้ว กดเมนู "รับรหัสประตู" ด้านล่างแชทเพื่อดูรหัส')]);
  } catch (e) { console.error('LINE lobby guest ready: ' + e); }
}

/* =========================================================
 * แอดมินใส่รหัสเอง: "ล็อบบี้ 21 482915" หรือ "ล็อบบี้ KM261111BBBB 482915"
 * ใช้หลังตั้งรหัสนั้นในกลอนแล้ว → บันทึกและเปิดใช้ทันที (แทนรหัสที่ระบบสุ่ม หรือเปลี่ยนรหัสที่ใช้อยู่)
 * ========================================================= */
const LC_SET_RE_ = /^(?:ล็อบบี้|ตั้งรหัส(?:ล็อบบี้)?)\s*(?:ช่อง\s*)?(\d{1,3}|KM\d{6}[A-Z0-9]{4})?\s*(\d+)?$/i;

/** รหัสที่เดาง่าย คืนเหตุผล (ว่าง = ใช้ได้) */
function lcWeakPin_(pin) {
  if (/^(\d)\1+$/.test(pin)) return 'เป็นเลขเดียวกันทั้งหมด';
  if ('01234567890'.indexOf(pin) >= 0 || '09876543210'.indexOf(pin) >= 0) return 'เป็นเลขเรียงกัน';
  return '';
}

function lcAdminSetPin_(ev, target, pin) {
  const src = ev.source || {};
  const help = 'พิมพ์: ล็อบบี้ <ช่อง> <รหัส 6–8 หลัก> เช่น ล็อบบี้ 21 482915\nหรือใช้รหัสการจองแทนช่อง เช่น ล็อบบี้ KM261111BBBB 482915\nพิมพ์ "งานล็อบบี้" เพื่อดูช่องที่รอตั้งรหัส';
  if (!target || !pin) return lineReply_(ev.replyToken, help);
  if (!/^\d{6,8}$/.test(pin)) return lineReply_(ev.replyToken, 'รหัสต้องเป็นตัวเลข 6–8 หลัก (PP9100 รับ 6–8 หลัก)\n' + help);
  const weak = lcWeakPin_(pin);
  if (weak) return lineReply_(ev.replyToken, 'รหัส ' + pin + ' ' + weak + ' เดาง่ายเกินไป กรุณาใช้รหัสอื่น');
  lcSweepSafe_();
  const byCode = /^KM/i.test(target);
  const key = byCode ? target.toUpperCase() : String(Number(target));
  const who = lineDisplayName_(src) || 'แอดมิน';
  const now = new Date();
  let notifyGuest = null, changed = false;
  const msg = withLock_(() => {
    const rows = lcRows_();
    const open = rows.filter(x => LC_OPEN_.indexOf(String(x.status)) >= 0 &&
      (byCode ? String(x.code).toUpperCase() === key : String(x.slot) === key))
      .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
    const r = open[0];
    if (!r) {
      if (!byCode) return 'ช่อง ' + key + ' ไม่มีการจองที่รอตั้งรหัสหรือใช้งานอยู่\nพิมพ์ "งานล็อบบี้" เพื่อดูช่องที่รอตั้งรหัส';
      const b = readTable_('bookings').find(x => String(x.code).trim().toUpperCase() === key);
      if (!b) return 'ไม่พบการจอง ' + key;
      const st = String(b.status);
      if (st === 'pending') return 'การจอง ' + key + ' ยังรอยืนยันการชำระเงิน อนุมัติก่อนแล้วระบบจะสร้างงานตั้งรหัสให้';
      if (st === 'cancelled' || st === 'checked_out') return 'การจอง ' + key + ' ' + (STATUS_TH_[st] || st) + ' ไม่ต้องตั้งรหัสแล้ว';
      if (strDate_(b.checkIn) > addDays_(today_(), LC_PREP_DAYS)) {
        return 'การจอง ' + key + ' เข้าพัก ' + thShort_(strDate_(b.checkIn)) + ' ระบบจะส่งงานตั้งรหัสให้ ' + LC_PREP_DAYS +
          ' วันก่อนเข้าพัก แล้วค่อยพิมพ์คำสั่งนี้อีกครั้ง';
      }
      return roomLabel_(b.roomNo) + ' ใช้ครบ 2 ช่องแล้ว (แขกคนก่อนยังไม่ได้ลบรหัส) รอแขกคนก่อนเช็คเอาท์แล้วลองใหม่';
    }
    const dup = rows.find(x => x.id !== r.id && ['pending', 'active', 'remove'].indexOf(String(x.status)) >= 0 && lcPin_(x) === pin);
    if (dup) return 'รหัส ' + pin + ' ซ้ำกับรหัสช่อง ' + dup.slot + ' ที่ยังอยู่ในกลอน กรุณาใช้รหัสอื่น';
    const roomNo = String(r.roomNo).replace(/^'/, '');
    const oldPin = lcPin_(r), wasActive = String(r.status) === 'active';
    if (wasActive && oldPin === pin) return 'ช่อง ' + r.slot + ' ใช้รหัส ' + pin + ' อยู่แล้ว';
    changed = wasActive;
    Object.assign(r, { pin: pin, status: 'active', setAt: now, setBy: safe_(who + ' · ใส่รหัสเอง') });
    lcWrite_(r);
    rows.filter(x => x.id !== r.id && String(x.slot) === String(r.slot) && String(x.status) === 'remove').forEach(x => {
      Object.assign(x, { status: 'removed', removedAt: now, removedBy: safe_('ทับด้วยรหัสใหม่ · ' + who) });
      lcWrite_(x);
    });
    notifyGuest = r.bookingId;
    return '✅ ' + (wasActive ? 'เปลี่ยน' : 'บันทึก') + 'รหัสล็อบบี้ช่อง ' + r.slot + ' เป็น ' + pin + ' แล้ว\n' +
      roomLabel_(roomNo) + ' · ' + unsafe_(r.guestName) + ' · ' + r.code +
      (wasActive ? '\nอย่าลืมลบรหัสเดิม ' + oldPin + ' ออกจากกลอน (ถ้าตั้งรหัสใหม่ทับช่องเดิมแล้ว ไม่ต้องทำอะไรเพิ่ม)' : '') +
      '\n' + lcGuestWhen_(r);
  });
  lineReply_(ev.replyToken, msg);
  if (notifyGuest) lcNotifyGuest_(notifyGuest, changed);
}

function lcAdminList_(ev) {
  lcSweepSafe_();
  const rows = lcRows_();
  const todo = rows.filter(r => ['pending', 'remove'].indexOf(String(r.status)) >= 0)
    .sort((a, b) => strDate_(a.checkIn).localeCompare(strDate_(b.checkIn)));
  const active = rows.filter(r => String(r.status) === 'active')
    .sort((a, b) => String(a.slot).localeCompare(String(b.slot)));
  const head = 'รหัสล็อบบี้ที่ใช้งานอยู่ ' + active.length + ' รหัส' +
    (active.length ? '\n' + active.map(r => '• ช่อง ' + r.slot + ' · ' + roomLabel_(String(r.roomNo).replace(/^'/, '')) +
      ' · ' + unsafe_(r.guestName) + ' · ถึง ' + thShort_(strDate_(r.checkOut))).join('\n') : '') +
    '\n\nงานค้าง ' + todo.length + ' รายการ' + (todo.length > 4 ? ' (แสดง 4 รายการแรก)' : '') +
    '\nใช้รหัสของคุณเอง: ตั้งในกลอนแล้วพิมพ์ ล็อบบี้ <ช่อง> <รหัส> เช่น ล็อบบี้ 21 482915';
  const cards = todo.slice(0, 4).map(r => lcAdminCard_(r, String(r.status) === 'pending' ? 'set' : 'del'));
  lineRequest_('reply', { replyToken: ev.replyToken, messages: [{ type: 'text', text: head }].concat(cards) });
}

/* =========================================================
 * Webhook: ปุ่มและคำสั่งของแอดมิน (ทำก่อนส่วนของลูกค้า)
 * ========================================================= */
(function () {
  const orig = handleLineWebhook_;
  handleLineWebhook_ = function (body) {
    if (!LC_ENABLED) return orig(body);
    const rest = [];
    (body.events || []).forEach(ev => {
      try {
        const src = ev.source || {};
        if (ev.type === 'postback' && /^lc=/.test(String((ev.postback && ev.postback.data) || ''))) {
          return lcAdminPostback_(ev, String(ev.postback.data));
        }
        if (ev.type === 'message' && ev.message && ev.message.type === 'text' && lcIsAdmin_(src)) {
          const text = String(ev.message.text || '').replace(/\s+/g, ' ').trim();
          if (/^(?:งานล็อบบี้|รหัสล็อบบี้ทั้งหมด)$/.test(text)) return lcAdminList_(ev);
          const m = text.match(LC_SET_RE_);
          if (m) return lcAdminSetPin_(ev, m[1], m[2]);
        }
      } catch (err) {
        console.error('LINE lobby admin: ' + err);
        try { lineReply_(ev.replyToken, 'ทำรายการไม่สำเร็จ: ' + String((err && err.message) || err).replace(/^BUSY:\s*/, '')); } catch (e) {}
        return;
      }
      rest.push(ev);
    });
    if (rest.length) return orig(Object.assign({}, body, { events: rest }));
    return ContentService.createTextOutput('OK');
  };
})();

/* =========================================================
 * ฝั่งแขก: "รับรหัสประตู" = รหัสเข้าล็อบบี้ของการจองนี้
 * ========================================================= */
function lcRowFor_(b) {
  return lcRows_().filter(r => String(r.bookingId) === String(b.id) && LC_OPEN_.indexOf(String(r.status)) >= 0)
    .sort((x, y) => y._row - x._row)[0] || null;
}

/** แจ้งแอดมินเมื่อแขกขอรหัสแต่ยังไม่พร้อม (ไม่เกิน 1 ครั้งต่อ 30 นาทีต่อการจอง) */
function lcAlertNotReady_(b, r) {
  const cache = CacheService.getScriptCache();
  const key = 'lc_wait_' + b.id;
  if (cache.get(key)) return;
  cache.put(key, '1', 1800);
  try {
    linePushAdmins_([{ type: 'text', text: '⚠️ แขก ' + unsafe_(b.guestName) + ' (' + b.code + ' · ' + roomLabel_(b.roomNo) + ') ' +
      (String(b.status) === 'checked_in' ? 'เช็คอินแล้วและ' : '') + 'ขอรหัสเข้าล็อบบี้แล้ว แต่' +
      (r ? 'ยังไม่ได้กด "ตั้งในกลอนแล้ว" ช่อง ' + r.slot : 'ยังไม่มีช่องว่างในกลอน') +
      (lcArrivalText_(b.arrivalTime) ? ' (แจ้งว่าจะมาถึง ' + lcArrivalText_(b.arrivalTime) + ')' : '') +
      '\nพิมพ์ "งานล็อบบี้" เพื่อดูงานค้าง หรือโทรหาแขก ' + phoneText_(b.phone) }]);
  } catch (e) { console.error('LINE lobby alert: ' + e); }
}

/** ยังไม่เช็คอิน: บอกให้เช็คอินก่อน แล้วค่อยกดรับรหัส */
function lcCheckinFirst_(b, st) {
  const url = lgCheckinUrl_(b);
  const busy = st && st.step === 'busy';
  return lineCard_({
    title: busy ? 'ห้องพักยังไม่พร้อมเช็คอิน' : 'เช็คอินก่อนรับรหัส',
    subtitle: roomLabel_(b.roomNo) + ' · การจอง ' + b.code,
    color: busy ? LG_AMBER_ : LG_GREEN_, textColor: busy ? LG_DARK_ : LG_PAPER_,
    alt: busy ? 'ห้องพักยังไม่พร้อมเช็คอิน' : 'เช็คอินก่อนรับรหัสเข้าล็อบบี้',
    rows: [
      { type: 'text', wrap: true, size: 'sm', color: LG_INK_, text: busy
        ? LG_ROOM_BUSY_MSG
        : 'รหัสเข้าล็อบบี้จะให้หลังเช็คอินเท่านั้น กดปุ่ม "เช็คอิน" ด้านล่าง (ใช้รหัสการจองและเบอร์โทรที่ใช้จอง) แล้วกดเมนู "รับรหัสประตู" อีกครั้ง' },
      lineRow_('ติดต่อ', scContact_())
    ],
    buttons: !busy && url ? [{ label: 'เช็คอิน', uri: url, primary: true, color: LG_GREEN_ }] : []
  });
}

function lcGuestMsg_(b, st) {
  if (st.step === 'wait') return lgStatusCard_(b, st);
  const ci = strDate_(b.checkIn);
  if (today_() < ci) {
    return lgText_('รหัสเข้าล็อบบี้ของการจอง ' + b.code + ' จะส่งให้ในวันเข้าพัก ' + thShort_(ci) +
      ' กดเมนู "รับรหัสประตู" อีกครั้งในวันนั้น');
  }
  if (LC_AFTER_CHECKIN_ONLY && String(b.status) !== 'checked_in') return lcCheckinFirst_(b, st);
  let r = lcRowFor_(b);
  if (!r) { lcSweepSafe_(); r = lcRowFor_(b); }
  if (r && String(r.status) === 'active') return lgDoorCard_(b);
  lcAlertNotReady_(b, r);
  return lgText_('รหัสเข้าล็อบบี้ของการจอง ' + b.code + ' กำลังเตรียม เราแจ้งเจ้าหน้าที่ให้แล้ว ' +
    'จะส่งข้อความบอกในแชทนี้ทันทีที่รหัสพร้อม หากรออยู่หน้าที่พัก กรุณาติดต่อ' + scContact_());
}

(function () {
  if (!LC_ENABLED) return;

  lgDoorMsgs_ = function (uid) {
    const mine = lgMine_(uid, true);
    if (!mine) return [lgHowTo_()];
    if (!mine.length) return [lgNothing_()];
    return mine.slice(0, 5).map(x => lcGuestMsg_(x.b, x.st));
  };

  /** การ์ดรหัสเข้าล็อบบี้ (ถ้ารหัสยังไม่พร้อม แสดงการ์ดสถานะแทน) */
  lgDoorCard_ = function (b) {
    const r = lcRowFor_(b);
    if (!r || String(r.status) !== 'active' || today_() < strDate_(b.checkIn)) return lgStatusCard_(b);
    if (LC_AFTER_CHECKIN_ONLY && String(b.status) !== 'checked_in') return lcCheckinFirst_(b, scState_(b));
    const st = scState_(b);
    const S = SC_STAY_INFO;
    const room = st.step === 'in' ? LC_ROOM_NOTE
      : st.step === 'busy' ? 'ยังไม่พร้อม อยู่ระหว่างรอผู้เข้าพักก่อนหน้าเช็คเอาท์ ฝากสัมภาระไว้ที่ล็อบบี้ก่อนได้ เราจะแจ้งในแชทนี้เมื่อห้องพร้อม'
      : st.step === 'open' ? 'ห้องพร้อมแล้ว กดปุ่ม "เช็คอิน" ด้านล่าง แล้วเข้าห้องได้เลย'
      : st.reason || '-';
    const rows = [
      { type: 'text', text: lcPin_(r), size: '3xl', weight: 'bold', align: 'center', color: LG_INK_ },
      { type: 'separator', margin: 'lg', color: '#E6DDCB' }
    ];
    if (LC_KEYPAD_NOTE) rows.push(lineRow_('วิธีกด', LC_KEYPAD_NOTE));
    rows.push(lineRow_('ห้อง', roomLabel_(b.roomNo)));
    rows.push(lineRow_('ห้องพัก', room));
    if (S.wifiName) {
      rows.push(lineRow_('Wi-Fi', S.wifiName));
      if (S.wifiPassword) rows.push(lineRow_('รหัส Wi-Fi', S.wifiPassword));
    }
    rows.push(lineRow_('ใช้ได้ถึง', 'เช็คเอาท์ ' + thShort_(strDate_(b.checkOut)) + ' ก่อน ' + AUTO_CHECKOUT_HOUR + ':00 น.'));
    rows.push(lineRow_('ติดต่อ', scContact_()));
    rows.push({ type: 'text', text: 'รหัสนี้ใช้เปิดประตูล็อบบี้ กรุณาอย่าส่งต่อให้ผู้อื่น', size: 'xs', color: '#7A6E63', wrap: true, margin: 'md' });
    const buttons = [];
    if (st.step === 'open' && lgCheckinUrl_(b)) buttons.push({ label: 'เช็คอิน', uri: lgCheckinUrl_(b), primary: true, color: LG_GREEN_ });
    if (st.step === 'in' && lgCheckoutUrl_(b)) buttons.push({ label: 'เช็คเอาท์', uri: lgCheckoutUrl_(b), primary: true, color: LG_BROWN_ });
    return lineCard_({
      title: 'รหัสเข้าล็อบบี้', subtitle: roomLabel_(b.roomNo) + ' · การจอง ' + b.code,
      color: LG_DARK_, textColor: LG_PAPER_,
      alt: 'รหัสเข้าล็อบบี้ ' + roomLabel_(b.roomNo) + ' (เปิดแชทเพื่อดูรหัส)',   // ไม่ใส่รหัสในแจ้งเตือนบนหน้าจอล็อก
      rows: rows, buttons: buttons
    });
  };

  /** หลังเช็คอิน: บอกวิธีเข้าห้อง */
  lgAfterCheckin_ = function (code, wasIn) {
    if (wasIn) return;
    try {
      const c = String(code || '').trim().toUpperCase();
      const b = readTable_('bookings').find(x => String(x.code).trim().toUpperCase() === c);
      if (b && String(b.status) === 'checked_in') {
        let r = lcRowFor_(b);
        if (!r) { lcSweepSafe_(); r = lcRowFor_(b); }
        const ready = r && String(r.status) === 'active';
        if (!ready) lcAlertNotReady_(b, r);
        lgPushBooking_(b.id, [lgText_('เช็คอิน ' + b.code + ' เรียบร้อย ยินดีต้อนรับสู่ ' + HOTEL_NAME +
          '\n' + roomLabel_(b.roomNo) + ' · ' + LC_ROOM_NOTE +
          (ready ? '\nกดเมนู "รับรหัสประตู" ด้านล่างแชทเพื่อรับรหัสเข้าล็อบบี้ (กดดูซ้ำได้ตลอดการเข้าพัก)'
            : '\nรหัสเข้าล็อบบี้กำลังเตรียม เราแจ้งเจ้าหน้าที่แล้ว จะส่งข้อความในแชทนี้ทันทีที่พร้อม'))]);
      }
    } catch (e) { console.error('LINE lobby checkin: ' + e); }
  };

  /** ห้องยังไม่ว่าง: ให้เบอร์ติดต่อเจ้าหน้าที่ (หรือบอกว่ารับรหัสล็อบบี้ได้ ถ้าไม่บังคับเช็คอินก่อน) */
  const origState = scState_;
  scState_ = function (b) {
    const st = origState(b);
    if (st.step === 'busy') st.reason = LC_AFTER_CHECKIN_ONLY
      ? LG_ROOM_BUSY_MSG + ' (' + scContact_() + ')'
      : LG_ROOM_BUSY_MSG + ' (รับรหัสเข้าล็อบบี้ได้จากเมนู "รับรหัสประตู" ใน LINE)';
    return st;
  };

  /** ห้องพักไม่ใช้รหัสแล้ว: เช็คอินได้โดยไม่ต้องมี doorCode ในแท็บ Rooms และไม่เตือนเรื่องรหัสซ้ำกับแขกคนก่อน */
  scRoomCode_ = function () { return 'LOBBY'; };
  scPrevCode_ = function () { return ''; };

  /** แจ้งเช็คเอาท์ถึงแอดมิน (ข้อความ "ต่อไป" เปลี่ยนเป็นงานลบรหัสล็อบบี้) */
  scNotifyCheckout_ = function (b, rating, comment) {
    try {
      const pb = publicBooking_(b);
      const rows = [
        lineRow_('รหัส', pb.code),
        lineRow_('ห้อง', roomLabel_(pb.roomNo)),
        lineRow_('ชื่อ', pb.guestName),
        lineRow_('เข้าพัก', thShort_(pb.checkIn) + ' – ' + thShort_(pb.checkOut)),
        lineRow_('คะแนน', rating >= 1 ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '-')
      ];
      if (comment) rows.push(lineRow_('ความเห็น', comment.slice(0, 300)));
      rows.push(lineRow_('ต่อไป', 'ทำความสะอาดห้อง และลบรหัสล็อบบี้ของแขกคนนี้ตามการ์ดที่ส่งตามมา'));
      const adminUrl = lineProps_().adminUrl;
      linePushAdmins_([lineCard_({
        title: 'เช็คเอาท์ด้วยตัวเองแล้ว',
        subtitle: Utilities.formatDate(new Date(), tz_(), 'HH:mm') + ' น. · ห้องพร้อมทำความสะอาด',
        color: LG_BROWN_, textColor: '#FFFFFF',
        alt: 'เช็คเอาท์แล้ว ' + pb.code + ' · ' + roomLabel_(pb.roomNo),
        rows: rows,
        buttons: adminUrl ? [{ label: 'เปิดแดชบอร์ด', uri: adminUrl, primary: true }] : []
      })]);
    } catch (e) { console.error('LINE self check-out: ' + e); }
  };

  /** หน้าเช็คอิน: บอกว่าใช้รหัสล็อบบี้ และวิธีเข้าห้อง */
  const origInfo = scInfo_;
  scInfo_ = function (b) {
    const out = origInfo(b);
    out.lobby = { enabled: true, roomNote: LC_ROOM_NOTE };
    return out;
  };

  /** ตรวจงานทันทีเมื่อสถานะการจองเปลี่ยน */
  const origStatus = changeStatus_;
  changeStatus_ = function (id, status, actor) {
    const pb = origStatus(id, status, actor);
    lcSweepSafe_();
    return pb;
  };
  if (typeof logCheckout_ === 'function') {
    const origLog = logCheckout_;
    logCheckout_ = function (pb, method, x) {
      origLog(pb, method, x);
      lcSweepSafe_();
    };
  }
  ['publicCancelBooking', 'publicRescheduleBooking', 'adminRescheduleBooking', 'adminExtendStay', 'createBooking', 'updateBooking']
    .forEach(name => {
      const fn = API_ACTIONS[name];
      if (typeof fn !== 'function') return;
      API_ACTIONS[name] = function () {
        const out = fn.apply(null, arguments);
        lcSweepSafe_();
        return out;
      };
    });
})();

/* =========================================================
 * เวลาที่คาดว่าจะมาถึง (คอลัมน์ arrivalTime ในแท็บ Bookings)
 * ลูกค้าเลือกในหน้าจอง แสดงในแจ้งเตือนการจองใหม่ แจ้งเตือนเช็คอิน การ์ดตั้งรหัสล็อบบี้ และแดชบอร์ด
 * ========================================================= */
function lcArrivalText_(v) {
  const t = unsafe_(v).replace(/^'/, '').replace(/\s*[-–—]\s*/g, '–').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return LC_ARRIVAL_SLOTS.indexOf(t) >= 0 ? t : t.slice(0, 30);
}

function lcArrivalOf_(bookingId) {
  try {
    const b = readTable_('bookings').find(x => String(x.id) === String(bookingId));
    return b ? lcArrivalText_(b.arrivalTime) : '';
  } catch (e) { return ''; }
}

let LC_ARR_MAP_ = null;   // code → เวลามาถึง ระหว่างสร้างการ์ดแจ้งเตือนแอดมิน

(function () {
  if (SHEETS.bookings.headers.indexOf('arrivalTime') < 0) SHEETS.bookings.headers.push('arrivalTime');

  /** รับค่าจากหน้าจอง (เฉพาะตัวเลือกที่กำหนด) แอดมินแก้การจองโดยไม่ส่งค่านี้ = คงค่าเดิม */
  const origValidate = validateBooking_;
  validateBooking_ = function (data, excludeId, isAdmin) {
    const d = origValidate(data, excludeId, isAdmin);
    const a = lcArrivalText_(data && data.arrivalTime);
    if (a && (isAdmin || LC_ARRIVAL_SLOTS.indexOf(a) >= 0)) d.arrivalTime = safe_(a);
    return d;
  };

  const origPub = publicBooking_;
  publicBooking_ = function (b) {
    const out = origPub(b);
    out.arrivalTime = lcArrivalText_(b && b.arrivalTime);
    return out;
  };

  const origCfg = publicGetConfig;
  publicGetConfig = function () {
    const out = origCfg();
    out.arrivalSlots = LC_ARRIVAL_SLOTS;
    return out;
  };
  API_ACTIONS.publicGetConfig = publicGetConfig;

  /** ใส่แถว "มาถึง" ต่อจากแถว "เข้าพัก" ของแต่ละการจองในการ์ดแจ้งเตือนแอดมิน */
  const origCard = lineCard_;
  lineCard_ = function (o) {
    if (LC_ARR_MAP_ && o && Array.isArray(o.rows)) {
      const rows = [];
      let code = '';
      o.rows.forEach(x => {
        rows.push(x);
        const c = x && x.type === 'box' && x.contents && x.contents[0];
        const label = c && c.text, val = x && x.contents && x.contents[1] && x.contents[1].text;
        if (label === 'รหัส') code = String(val || '');
        if (label === 'เข้าพัก' && LC_ARR_MAP_[code]) rows.push(lineRow_('มาถึง', 'ประมาณ ' + LC_ARR_MAP_[code]));
      });
      o = Object.assign({}, o, { rows: rows });
    }
    return origCard(o);
  };
  const withArrivals = (list, fn) => {
    LC_ARR_MAP_ = {};
    (list || []).forEach(b => { if (b && b.arrivalTime) LC_ARR_MAP_[String(b.code)] = lcArrivalText_(b.arrivalTime); });
    try { return fn(); } finally { LC_ARR_MAP_ = null; }
  };
  const origNotify = lineNotifyBooking_;
  lineNotifyBooking_ = function (type, b, reason) { return withArrivals([b], () => origNotify(type, b, reason)); };
  const origRemind = lineNotifyReminders_;
  lineNotifyReminders_ = function (due) { return withArrivals(due, () => origRemind(due)); };
})();
