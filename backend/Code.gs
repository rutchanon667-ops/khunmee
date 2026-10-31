/**********************************************************
 * Khun Mhee: ระบบหลังบ้าน (Google Apps Script + Google Sheets)
 * - Login แอดมิน และจัดการผู้ใช้งาน
 * - จัดการการจองห้องพัก (แท็บ Bookings) และห้องพัก (แท็บ Rooms)
 * - แดชบอร์ดสรุปข้อมูล
 * - อีเมลแจ้งแอดมินเมื่อมีการจอง/ยกเลิก และแจ้งเตือนก่อนวันเช็คอิน
 * - Web API (doPost) ให้หน้าเว็บบน GitHub Pages เรียกใช้
 * - แจ้งเตือนแอดมินทาง LINE Official Account (Messaging API)
 **********************************************************/

/***** CONFIG *****/
const SHEETS = {
  users: {
    name: 'Users',
    headers: ['id', 'username', 'passwordHash', 'salt', 'fullname', 'email', 'role', 'status', 'createdAt', 'lastLogin']
  },
  bookings: {
    name: 'Bookings',
    headers: ['id', 'code', 'roomNo', 'guestName', 'phone', 'email', 'checkIn', 'checkOut', 'nights', 'guests',
              'totalPrice', 'status', 'note', 'source', 'createdAt', 'updatedAt', 'reminderSent',
              'pets', 'payMethod', 'slipUrl', 'confirmedAt']
  },
  rooms: {
    name: 'Rooms',
    headers: ['roomNo', 'name', 'type', 'pricePerNight', 'capacity', 'status']
  }
};

const ROLES = ['admin', 'staff', 'user'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
const BLOCKING_STATUSES = ['pending', 'confirmed', 'checked_in'];   // สถานะที่ทำให้ห้องไม่ว่าง
const MAX_NIGHTS = 60;

const SESSION_SECONDS = 6 * 60 * 60;  // CacheService เก็บได้สูงสุด 6 ชั่วโมง
const MAX_ATTEMPTS = 5;               // ใส่รหัสผิดได้กี่ครั้งก่อนล็อก
const LOCK_SECONDS = 15 * 60;         // ล็อก 15 นาที

const HOTEL_NAME = 'Khun Mhee';
const REMINDER_HOUR = 9;              // ส่งแจ้งเตือนเช็คอินทุกวันเวลา 9 โมง (ตามเขตเวลาของชีต)
const REMIND_DAYS_BEFORE = 1;         // แจ้งเตือนล่วงหน้ากี่วัน
const SEND_GUEST_REMINDER = true;     // ส่งอีเมลเตือนถึงลูกค้าด้วย (ถ้าลูกค้าให้อีเมลไว้)

/***** ข้อมูลการชำระเงินที่แสดงบนหน้าเว็บ (แก้เป็นข้อมูลจริง) *****/
const PAYMENT = {
  bankName: '',          // เช่น 'ธนาคารกสิกรไทย'
  accountName: '',       // ชื่อบัญชี
  accountNo: '',         // เลขที่บัญชี เช่น '123-4-56789-0'
  promptpayName: '',     // ชื่อผู้รับเงินพร้อมเพย์
  promptpayQrUrl: '',    // ลิงก์รูป QR พร้อมเพย์ (เช่น ไฟล์ images/promptpay-qr.png บนเว็บ)
  payWithinHours: 24     // ต้องชำระภายในกี่ชั่วโมง
};

/***** ข้อมูลที่พักที่แสดงบนใบเสร็จ (เว้นว่างได้) *****/
const HOTEL_INFO = {
  legalName: '',         // ชื่อผู้ออกใบเสร็จ เช่น 'Khun Mhee · Pet Friendly House'
  address: '',           // ที่อยู่
  phone: '',             // เบอร์โทร
  taxId: ''              // เลขประจำตัวผู้เสียภาษี (ถ้ามี)
};

const HOLD_MINUTES = 5;   // กันห้องไว้ให้ลูกค้าที่กำลังกรอกข้อมูล/ชำระเงิน (นาที)

const SLIP_FOLDER_NAME = 'Khun Mhee · สลิปการโอน';   // โฟลเดอร์ใน Google Drive ที่เก็บสลิป
const MAX_SLIP_BYTES = 5 * 1024 * 1024;              // สลิปไม่เกิน 5 MB
const PAY_METHODS = { bank: 'โอนผ่านบัญชีธนาคาร', qr: 'QR พร้อมเพย์' };

/***** WEB APP *****/
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(HOTEL_NAME + ' · ระบบหลังบ้าน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Web API สำหรับหน้าเว็บบน GitHub Pages
 * หน้าเว็บส่ง POST (Content-Type: text/plain) เนื้อหาเป็น JSON: { action: 'ชื่อฟังก์ชัน', args: [...] }
 * ตอบกลับเป็น JSON: { ok: true, data } หรือ { ok: false, error }
 * เรียกได้เฉพาะฟังก์ชันที่อยู่ในรายการนี้เท่านั้น ฟังก์ชันของแอดมินตรวจ token เองทุกตัว
 */
const API_ACTIONS = {
  // ลูกค้า (ไม่ต้อง login)
  publicGetConfig: publicGetConfig,
  publicListRooms: publicListRooms,
  publicGetBookedDates: publicGetBookedDates,
  publicGetAvailableRooms: publicGetAvailableRooms,
  publicCreateBooking: publicCreateBooking,
  publicGetBookingStatus: publicGetBookingStatus,
  publicCancelBooking: publicCancelBooking,
  publicHoldDates: publicHoldDates,
  publicReleaseHold: publicReleaseHold,
  // แอดมิน
  login: login,
  logout: logout,
  getCurrentUser: getCurrentUser,
  getDashboard: getDashboard,
  listBookings: listBookings,
  listRooms: listRooms,
  setBookingStatus: setBookingStatus,
  sendGuestReminder: sendGuestReminder,
  setupReminders: setupReminders,
  disableReminders: disableReminders,
  sendTestEmail: sendTestEmail,
  sendTestLine: sendTestLine
};

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (Array.isArray(req.events) && 'destination' in req) return handleLineWebhook_(req);   // Webhook จาก LINE
    const fn = Object.prototype.hasOwnProperty.call(API_ACTIONS, req.action) ? API_ACTIONS[req.action] : null;
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง ' + String(req.action || ''));
    const args = Array.isArray(req.args) ? req.args : [];
    out = { ok: true, data: fn.apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/***** SETUP: รันได้ทุกเมื่อ ไม่ลบข้อมูลเดิม *****/
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(key => {
    const def = SHEETS[key];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(def.headers);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
    } else {
      // เพิ่มคอลัมน์ใหม่ที่ยังไม่มี (ต่อท้าย) โดยไม่แตะข้อมูลเดิม
      const width = Math.max(sh.getLastColumn(), 1);
      const current = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
      def.headers.forEach((h, i) => {
        if (current[i] !== h) {
          if (current.indexOf(h) >= 0) throw new Error('แท็บ ' + def.name + ': คอลัมน์ "' + h + '" อยู่ผิดตำแหน่ง ต้องเป็นคอลัมน์ที่ ' + (i + 1));
          if (current[i]) throw new Error('แท็บ ' + def.name + ': คอลัมน์ที่ ' + (i + 1) + ' ควรเป็น "' + h + '" แต่พบ "' + current[i] + '"');
          sh.getRange(1, i + 1).setValue(h).setFontWeight('bold');
          current[i] = h;
        }
      });
    }
  });
  if (!readTable_('users').some(u => u.username === 'admin')) {
    insertUser_({
      username: 'admin', password: 'admin1234',
      fullname: 'Administrator', email: '', role: 'admin', status: 'active'
    });
    Logger.log('สร้างแอดมินเริ่มต้นแล้ว: admin / admin1234 (เปลี่ยนรหัสทันทีหลังเข้าระบบ)');
  }
  if (!readTable_('rooms').length) {
    const sh = sheet_('rooms');
    [['1', 'ห้องโชจิ', 'double'], ['2', 'ห้องฮิโนกิ', 'double'],
     ['3', 'ห้องยาเนะ', 'double'], ['4', 'ห้องโคโมเรบิ', 'double']]
      .forEach(r => sh.appendRow([r[0], r[1], r[2], 0, 2, 'active']));
    Logger.log('เพิ่มห้องพัก 4 ห้องแล้ว ใส่ราคาต่อคืนในแท็บ Rooms (คอลัมน์ pricePerNight)');
  }
}

/* =========================================================
 * AUTH
 * ========================================================= */
function login(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_ATTEMPTS) throw new Error('ใส่รหัสผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว 15 นาที');

  const user = findUser_(u => u.username === username);
  if (!user || user.passwordHash !== hash_(password, user.salt)) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (user.status !== 'active') throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
  if (user.role !== 'admin') throw new Error('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');

  cache.remove(failKey);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const session = { id: user.id, username: user.username, fullname: user.fullname, role: user.role };
  cache.put('sess_' + token, JSON.stringify(session), SESSION_SECONDS);
  setCell_('users', user._row, 'lastLogin', new Date());
  return { token: token, user: session };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return true;
}

function getCurrentUser(token) {
  try { return requireAdmin_(token); } catch (e) { return null; }
}

/** ตรวจสิทธิ์ทุกครั้งที่เรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ (ห้ามเชื่อฝั่ง client) */
function requireAdmin_(token) {
  const cache = CacheService.getScriptCache();
  const raw = token && cache.get('sess_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  const s = JSON.parse(raw);
  const u = findUser_(x => x.id === s.id);
  if (!u || u.role !== 'admin' || u.status !== 'active') {
    cache.remove('sess_' + token);
    throw new Error('SESSION_EXPIRED');
  }
  return s;
}

/* =========================================================
 * USERS (เฉพาะแอดมิน)
 * ========================================================= */
function listUsers(token) {
  requireAdmin_(token);
  return readTable_('users').map(publicUser_);
}

function createUser(token, data) {
  requireAdmin_(token);
  return withLock_(() => {
    const d = validateUser_(data, true);
    checkPassword_(data.password);
    if (findUser_(u => u.username === d.username)) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    d.password = data.password;
    insertUser_(d);
    return 'เพิ่มผู้ใช้เรียบร้อย';
  });
}

function updateUser(token, id, data) {
  const me = requireAdmin_(token);
  return withLock_(() => {
    const u = findUser_(x => x.id === id);
    if (!u) throw new Error('ไม่พบผู้ใช้');
    const d = validateUser_(data, false);
    if (u.id === me.id && (d.role !== 'admin' || d.status !== 'active')) {
      throw new Error('ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้');
    }
    Object.assign(u, { fullname: d.fullname, email: d.email, role: d.role, status: d.status });
    writeRow_('users', u);
    return 'บันทึกเรียบร้อย';
  });
}

function deleteUser(token, id) {
  const me = requireAdmin_(token);
  return withLock_(() => {
    if (id === me.id) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
    const u = findUser_(x => x.id === id);
    if (!u) throw new Error('ไม่พบผู้ใช้');
    sheet_('users').deleteRow(u._row);
    return 'ลบผู้ใช้เรียบร้อย';
  });
}

function resetPassword(token, id, newPassword) {
  requireAdmin_(token);
  checkPassword_(newPassword);
  return withLock_(() => {
    const u = findUser_(x => x.id === id);
    if (!u) throw new Error('ไม่พบผู้ใช้');
    setPassword_(u, newPassword);
    return 'รีเซ็ตรหัสผ่านเรียบร้อย';
  });
}

function changeMyPassword(token, oldPassword, newPassword) {
  const me = requireAdmin_(token);
  checkPassword_(newPassword);
  return withLock_(() => {
    const u = findUser_(x => x.id === me.id);
    if (u.passwordHash !== hash_(String(oldPassword || ''), u.salt)) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    setPassword_(u, newPassword);
    return 'เปลี่ยนรหัสผ่านเรียบร้อย';
  });
}

/* =========================================================
 * ROOMS
 * ========================================================= */
function listRooms(token) {
  requireAdmin_(token);
  return readRooms_();
}

/** สำหรับหน้าเว็บลูกค้า: ห้องที่ว่างในช่วงวันที่เลือก (ไม่ต้อง login) */
function publicGetAvailableRooms(checkIn, checkOut) {
  const r = checkDates_(checkIn, checkOut, false);
  const bookings = readTable_('bookings');
  return readRooms_()
    .filter(room => room.status === 'active')
    .filter(room => !findConflict_(bookings, room.roomNo, r.checkIn, r.checkOut, null))
    .map(room => Object.assign({}, room, { nights: r.nights, totalPrice: r.nights * room.pricePerNight }));
}

/** สำหรับหน้าเว็บลูกค้า: รายชื่อห้องที่เปิดให้จอง พร้อมราคาและจำนวนคนสูงสุด */
function publicListRooms() {
  return readRooms_().filter(r => r.status === 'active');
}

/**
 * สำหรับปฏิทินหน้าเว็บ: ช่วงวันที่ที่แต่ละห้องไม่ว่าง (ไม่มีข้อมูลลูกค้า)
 * คืนค่า { '1': [['2026-11-04','2026-11-07'], ...], ... } วันเช็คเอาท์ไม่นับเป็นคืนที่ไม่ว่าง
 */
function publicGetBookedDates(from, to, excludeHoldId) {
  from = strDate_(from) || today_();
  to = strDate_(to) || addDays_(from, 120);
  if (!isDate_(from) || !isDate_(to)) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  if (daysBetween_(from, to) > 400) to = addDays_(from, 400);
  const out = {};
  readTable_('bookings').forEach(b => {
    if (BLOCKING_STATUSES.indexOf(b.status) < 0) return;
    const ci = strDate_(b.checkIn), co = strDate_(b.checkOut);
    if (!(ci < to && co > from)) return;
    const key = String(b.roomNo);
    (out[key] = out[key] || []).push([ci, co]);
  });
  readHolds_().forEach(h => {
    if (h.id === excludeHoldId || !(h.ci < to && h.co > from)) return;
    const key = String(h.roomNo);
    (out[key] = out[key] || []).push([h.ci, h.co, 'hold']);   // มีลูกค้ากำลังจอง (ยังไม่ชำระ)
  });
  return out;
}

/* =========================================================
 * BOOKINGS (แอดมิน)
 * ========================================================= */
function listBookings(token) {
  requireAdmin_(token);
  return readTable_('bookings')
    .map(publicBooking_)
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || b.createdAt.localeCompare(a.createdAt));
}

function createBooking(token, data) {
  const me = requireAdmin_(token);
  const status = data && data.status === 'pending' ? 'pending' : 'confirmed';
  const b = withLock_(() => insertBooking_(data, status, 'admin:' + me.username, true, {}));
  return { message: 'บันทึกการจอง ' + b.code + ' เรียบร้อย', code: b.code };
}

function updateBooking(token, id, data) {
  requireAdmin_(token);
  return withLock_(() => {
    const b = readTable_('bookings').find(x => x.id === id);
    if (!b) throw new Error('ไม่พบการจองนี้');
    if (b.status === 'cancelled' || b.status === 'checked_out') {
      throw new Error('การจองที่ยกเลิกหรือเช็คเอาท์แล้วแก้ไขไม่ได้');
    }
    const d = validateBooking_(Object.assign({ pets: b.pets }, data), b.id, true);
    Object.assign(b, d, { updatedAt: new Date() });
    if (d.checkIn !== strDate_(b._orig.checkIn)) b.reminderSent = '';  // เปลี่ยนวันเช็คอิน ให้เตือนใหม่
    writeRow_('bookings', b);
    return 'บันทึกการแก้ไข ' + b.code + ' เรียบร้อย';
  });
}

function setBookingStatus(token, id, status) {
  const me = requireAdmin_(token);
  const b = changeStatus_(id, status, me.username);
  return 'เปลี่ยนสถานะ ' + b.code + ' เป็น "' + STATUS_TH_[status] + '" เรียบร้อย';
}

/** เปลี่ยนสถานะการจอง คืนค่าการจองหลังเปลี่ยน */
function changeStatus_(id, status, actor) {
  if (BOOKING_STATUSES.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const allowed = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['checked_in', 'cancelled', 'pending'],
    checked_in: ['checked_out', 'confirmed'],
    checked_out: ['checked_in'],
    cancelled: []
  };
  const b = withLock_(() => {
    const x = readTable_('bookings').find(r => r.id === id);
    if (!x) throw new Error('ไม่พบการจองนี้');
    if (allowed[x.status].indexOf(status) < 0) {
      throw new Error(String(x.code) + ' เปลี่ยนจาก "' + STATUS_TH_[x.status] + '" เป็น "' + STATUS_TH_[status] + '" ไม่ได้');
    }
    x.status = status;
    x.updatedAt = new Date();
    if (status === 'confirmed' && !x.confirmedAt) x.confirmedAt = new Date();
    if (status === 'cancelled') x.note = appendNote_(x.note, 'ยกเลิกโดย ' + actor);
    writeRow_('bookings', x);
    return x;
  });
  const pb = publicBooking_(b);
  if (status === 'cancelled') notifyBookingEvent_('cancel', pb, 'ยกเลิกโดยแอดมิน ' + actor);
  if (status === 'confirmed' && pb.email) {
    sendMail_(pb.email, 'ยืนยันการจองห้องพัก ' + pb.code,
      '<p>สวัสดีคุณ ' + esc_(pb.guestName) + '</p>' +
      '<p>เราได้รับการชำระเงินและยืนยันการจองของคุณแล้ว</p>' +
      '<p>รหัสการจอง: <b>' + esc_(pb.code) + '</b><br>' +
      roomLabel_(pb.roomNo) + ' · ' + esc_(pb.checkIn) + ' ถึง ' + esc_(pb.checkOut) + ' (' + pb.nights + ' คืน)</p>' +
      '<p>ดูและดาวน์โหลดใบเสร็จได้ที่หน้าการจองบนเว็บไซต์ แล้วพบกันที่ ' + HOTEL_NAME + '</p>');
  }
  return pb;
}

/* =========================================================
 * BOOKINGS (สำหรับหน้าเว็บลูกค้า ไม่ต้อง login)
 * ========================================================= */
/** ข้อมูลที่หน้าเว็บต้องใช้: วันนี้ตามเขตเวลาของชีต และข้อมูลการชำระเงิน */
function publicGetConfig() {
  return {
    hotelName: HOTEL_NAME,
    today: today_(),
    maxNights: MAX_NIGHTS,
    payment: PAYMENT,
    payMethods: PAY_METHODS,
    holdMinutes: HOLD_MINUTES,
    hotel: HOTEL_INFO
  };
}

/**
 * ลูกค้าจองผ่านหน้าเว็บ พร้อมแนบสลิป
 * data: { roomNo, checkIn, checkOut, guests, guestName, phone, email, pets, note,
 *         payMethod: 'bank' | 'qr', slip: { name, mimeType, base64 } }
 */
function publicCreateBooking(data) {
  data = data || {};
  const payMethod = PAY_METHODS[data.payMethod] ? data.payMethod : '';
  if (!payMethod) throw new Error('กรุณาเลือกวิธีชำระเงิน');
  validateBooking_(data, null, false);                 // ตรวจก่อนบันทึกสลิป จะได้ไม่มีไฟล์ค้าง
  const slip = saveSlip_(data.slip, data.phone);
  let b;
  try {
    b = withLock_(() => {
      const x = insertBooking_(data, 'pending', 'web', false, { payMethod: payMethod, slipUrl: slip.url });
      if (data.holdId) saveHolds_(readHolds_().filter(h => h.id !== data.holdId));
      return x;
    });
  } catch (err) {
    try { DriveApp.getFileById(slip.id).setTrashed(true); } catch (e) {}
    throw err;
  }
  notifyBookingEvent_('new', publicBooking_(b), 'จองผ่านหน้าเว็บ · แนบสลิปแล้ว รอตรวจสอบ');
  return {
    code: b.code, roomNo: b.roomNo, checkIn: b.checkIn, checkOut: b.checkOut,
    nights: b.nights, totalPrice: b.totalPrice, status: b.status
  };
}

/** ลูกค้าตรวจสถานะการจองด้วยรหัสการจอง + เบอร์โทรที่ใช้จอง */
function publicGetBookingStatus(code, phone) {
  code = String(code || '').trim().toUpperCase();
  phone = normPhone_(phone);
  const x = readTable_('bookings').find(r => String(r.code) === code && normPhone_(r.phone) === phone);
  if (!x) throw new Error('ไม่พบการจองที่ตรงกับรหัสและเบอร์โทรนี้');
  const b = publicBooking_(x);
  const out = {
    code: b.code, roomNo: b.roomNo, checkIn: b.checkIn, checkOut: b.checkOut,
    nights: b.nights, totalPrice: b.totalPrice, status: b.status, updatedAt: b.updatedAt
  };
  if (['confirmed', 'checked_in', 'checked_out'].indexOf(b.status) >= 0) {
    const room = readRooms_().find(r => r.roomNo === b.roomNo);
    out.receipt = {
      no: b.code,
      issuedAt: b.confirmedAt || b.updatedAt,
      guestName: b.guestName, phone: b.phone, email: b.email,
      roomName: room ? room.name : 'ห้อง ' + b.roomNo, roomNo: b.roomNo,
      checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, guests: b.guests, pets: b.pets,
      pricePerNight: b.nights ? Math.round(b.totalPrice / b.nights * 100) / 100 : 0,
      totalPrice: b.totalPrice,
      payMethod: PAY_METHODS[b.payMethod] || b.payMethod || '-',
      hotelName: HOTEL_INFO.legalName || HOTEL_NAME,
      hotel: HOTEL_INFO
    };
  }
  return out;
}

/* =========================================================
 * HOLDS: กันห้องชั่วคราวระหว่างลูกค้ากรอกข้อมูลและชำระเงิน
 * เก็บใน Script Properties (HOLDS) หมดอายุอัตโนมัติ
 * ========================================================= */
function readHolds_() {
  let list = [];
  try { list = JSON.parse(PropertiesService.getScriptProperties().getProperty('HOLDS') || '[]'); } catch (e) {}
  const now = Date.now();
  return list.filter(h => h && h.exp > now);
}

function saveHolds_(list) {
  PropertiesService.getScriptProperties().setProperty('HOLDS', JSON.stringify(list));
}

function findHoldConflict_(roomNo, checkIn, checkOut, excludeHoldId) {
  return readHolds_().find(h => h.id !== excludeHoldId && String(h.roomNo) === String(roomNo) &&
    checkIn < h.co && checkOut > h.ci) || null;
}

/**
 * ลูกค้ากด "ถัดไป" หลังเลือกห้องและวัน: กันห้องไว้ HOLD_MINUTES นาที
 * ถ้าส่ง prevHoldId มา จะยกเลิกอันเดิมของลูกค้าคนนั้นก่อน (เปลี่ยนวัน/ต่อเวลา)
 * คืน { holdId, expiresIn (วินาที) }
 */
function publicHoldDates(roomNo, checkIn, checkOut, prevHoldId) {
  roomNo = String(roomNo || '').trim();
  const room = readRooms_().find(r => r.roomNo === roomNo && r.status === 'active');
  if (!room) throw new Error('กรุณาเลือกห้องพัก');
  const r = checkDates_(checkIn, checkOut, false);
  return withLock_(() => {
    const conflict = findConflict_(readTable_('bookings'), roomNo, r.checkIn, r.checkOut, null);
    if (conflict) throw new Error('ขออภัย ' + room.name + ' ไม่ว่างในช่วงวันที่นี้แล้ว กรุณาเลือกวันหรือห้องอื่น');
    let holds = readHolds_().filter(h => h.id !== prevHoldId);
    if (holds.some(h => String(h.roomNo) === roomNo && r.checkIn < h.co && r.checkOut > h.ci)) {
      throw new Error('มีลูกค้าท่านอื่นกำลังจอง' + room.name + 'ในช่วงวันที่นี้ ลองใหม่อีกครั้งในไม่กี่นาที หรือเลือกวันอื่น');
    }
    if (holds.length >= 50) throw new Error('ระบบมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่อีกครั้ง');
    const hold = { id: Utilities.getUuid(), roomNo: roomNo, ci: r.checkIn, co: r.checkOut, exp: Date.now() + HOLD_MINUTES * 60000 };
    holds.push(hold);
    saveHolds_(holds);
    return { holdId: hold.id, expiresIn: HOLD_MINUTES * 60 };
  });
}

function publicReleaseHold(holdId) {
  if (!holdId) return true;
  withLock_(() => saveHolds_(readHolds_().filter(h => h.id !== holdId)));
  return true;
}

/** ลูกค้ายกเลิกเองด้วยรหัสการจอง + เบอร์โทรที่ใช้จอง */
function publicCancelBooking(code, phone) {
  code = String(code || '').trim().toUpperCase();
  phone = normPhone_(phone);
  const b = withLock_(() => {
    const x = readTable_('bookings').find(r => r.code === code && normPhone_(r.phone) === phone);
    if (!x) throw new Error('ไม่พบการจองที่ตรงกับรหัสและเบอร์โทรนี้');
    if (['pending', 'confirmed'].indexOf(x.status) < 0) throw new Error('การจองนี้ยกเลิกไม่ได้แล้ว');
    x.status = 'cancelled';
    x.updatedAt = new Date();
    x.note = appendNote_(x.note, 'ลูกค้ายกเลิกผ่านหน้าเว็บ');
    writeRow_('bookings', x);
    return x;
  });
  notifyBookingEvent_('cancel', publicBooking_(b), 'ลูกค้ายกเลิกผ่านหน้าเว็บ');
  return 'ยกเลิกการจอง ' + b.code + ' เรียบร้อยแล้ว';
}

/** บันทึกสลิปลง Google Drive (โฟลเดอร์ส่วนตัวของเจ้าของสคริปต์) คืนค่า { id, url } */
function saveSlip_(slip, phone) {
  if (!slip || !slip.base64) throw new Error('กรุณาแนบสลิปการโอน');
  const mime = String(slip.mimeType || '');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime) && mime !== 'application/pdf') {
    throw new Error('สลิปต้องเป็นไฟล์รูปภาพ (JPG, PNG) หรือ PDF');
  }
  const bytes = Utilities.base64Decode(String(slip.base64).replace(/^data:[^,]*,/, ''));
  if (!bytes.length) throw new Error('ไฟล์สลิปว่างเปล่า');
  if (bytes.length > MAX_SLIP_BYTES) throw new Error('ไฟล์สลิปต้องไม่เกิน 5 MB');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
                'image/heif': 'heif', 'application/pdf': 'pdf' }[mime];
  const name = 'slip_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd_HHmmss') + '_' +
               normPhone_(phone).slice(-4) + '.' + ext;
  const file = slipFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  return { id: file.getId(), url: file.getUrl() };
}

function slipFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SLIP_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  const folder = DriveApp.createFolder(SLIP_FOLDER_NAME);
  props.setProperty('SLIP_FOLDER_ID', folder.getId());
  return folder;
}

/* =========================================================
 * DASHBOARD
 * ========================================================= */
function getDashboard(token) {
  requireAdmin_(token);
  const today = today_();
  const month = today.slice(0, 7);
  const rooms = readRooms_().filter(r => r.status === 'active');
  const all = readTable_('bookings').map(publicBooking_);
  const live = all.filter(b => b.status !== 'cancelled');

  const inHouse = live.filter(b =>
    ['confirmed', 'checked_in'].indexOf(b.status) >= 0 && b.checkIn <= today && today < b.checkOut);
  const occupiedRooms = {};
  inHouse.forEach(b => occupiedRooms[b.roomNo] = true);

  const arrivals = live.filter(b => b.checkIn === today && ['pending', 'confirmed'].indexOf(b.status) >= 0);
  const departures = live.filter(b => b.checkOut === today && ['confirmed', 'checked_in'].indexOf(b.status) >= 0);
  const in7 = addDays_(today, 7);
  const upcoming = live
    .filter(b => b.checkIn > today && b.checkIn <= in7 && ['pending', 'confirmed'].indexOf(b.status) >= 0)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  // รายได้ 6 เดือนล่าสุด (นับตามเดือนที่เช็คอิน ไม่รวมที่ยกเลิก)
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths_(month, -i));
  const revenueByMonth = months.map(m => ({
    month: m,
    total: live.filter(b => b.checkIn.slice(0, 7) === m).reduce((s, b) => s + b.totalPrice, 0),
    count: live.filter(b => b.checkIn.slice(0, 7) === m).length
  }));

  const statusCounts = {};
  BOOKING_STATUSES.forEach(s => statusCounts[s] = 0);
  all.forEach(b => { if (statusCounts[b.status] !== undefined) statusCounts[b.status]++; });

  return {
    today: today,
    rooms: rooms.length,
    roomList: rooms,
    occupied: Object.keys(occupiedRooms).length,
    occupancy: rooms.length ? Object.keys(occupiedRooms).length / rooms.length : 0,
    arrivals: arrivals,
    departures: departures,
    inHouse: inHouse.length,
    pending: all.filter(b => b.status === 'pending').sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    upcoming: upcoming,
    revenueThisMonth: revenueByMonth[revenueByMonth.length - 1].total,
    bookingsThisMonth: all.filter(b => b.createdAt.slice(0, 7) === month).length,
    cancelledThisMonth: all.filter(b => b.status === 'cancelled' && b.updatedAt.slice(0, 7) === month).length,
    revenueByMonth: revenueByMonth,
    statusCounts: statusCounts,
    recent: all.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    reminder: reminderInfo_()
  };
}

/* =========================================================
 * NOTIFICATIONS
 * ========================================================= */
/** แอดมินกดเปิดจากแดชบอร์ด: ตั้งเวลาส่งแจ้งเตือนเช็คอินทุกวัน */
function setupReminders(token) {
  requireAdmin_(token);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendCheckinReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendCheckinReminders')
    .timeBased().everyDays(1).atHour(REMINDER_HOUR).inTimezone(tz_()).create();
  return 'เปิดการแจ้งเตือนรายวันแล้ว ระบบจะส่งอีเมลทุกวันประมาณ ' + REMINDER_HOUR + ':00 น.';
}

/** ปิดการแจ้งเตือนรายวัน */
function disableReminders(token) {
  requireAdmin_(token);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendCheckinReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  return 'ปิดการแจ้งเตือนรายวันแล้ว';
}

/** แอดมินกดส่งอีเมลเตือนลูกค้ารายคนจากแดชบอร์ด */
function sendGuestReminder(token, id) {
  requireAdmin_(token);
  const b = withLock_(() => {
    const x = readTable_('bookings').find(r => r.id === id);
    if (!x) throw new Error('ไม่พบการจองนี้');
    if (['pending', 'confirmed'].indexOf(x.status) < 0) throw new Error('การจองนี้ไม่ต้องเตือนแล้ว');
    if (!/@/.test(String(x.email))) throw new Error('ลูกค้าไม่ได้ให้อีเมลไว้ กรุณาโทรแจ้งที่เบอร์ ' + unsafe_(x.phone));
    x.reminderSent = new Date();
    writeRow_('bookings', x);
    return publicBooking_(x);
  });
  sendMail_(b.email, 'เตือนวันเข้าพักที่ ' + HOTEL_NAME, guestReminderHtml_(b));
  return 'ส่งอีเมลเตือนถึง ' + b.guestName + ' แล้ว';
}

function sendTestEmail(token) {
  requireAdmin_(token);
  const to = adminEmails_();
  if (!to.length) throw new Error('ยังไม่มีแอดมินที่ใส่อีเมลไว้ เพิ่มอีเมลในแท็บผู้ใช้งานก่อน');
  sendMail_(to.join(','), 'ทดสอบการแจ้งเตือน', '<p>ระบบส่งอีเมลแจ้งเตือนของ ' + HOTEL_NAME + ' ทำงานปกติ</p>');
  return 'ส่งอีเมลทดสอบไปที่ ' + to.join(', ') + ' แล้ว';
}

/** ทำงานอัตโนมัติทุกวันจาก trigger: เตือนการเช็คอินที่ใกล้ถึง ส่งซ้ำไม่ได้เพราะมีคอลัมน์ reminderSent */
function sendCheckinReminders() {
  const target = addDays_(today_(), REMIND_DAYS_BEFORE);
  const due = withLock_(() => {
    const rows = readTable_('bookings').filter(b =>
      strDate_(b.checkIn) <= target && strDate_(b.checkIn) >= today_() &&
      ['pending', 'confirmed'].indexOf(b.status) >= 0 && !b.reminderSent);
    rows.forEach(b => { b.reminderSent = new Date(); writeRow_('bookings', b); });
    return rows.map(publicBooking_);
  });
  if (!due.length) return 0;

  const admins = adminEmails_();
  if (admins.length) {
    const rows = due.map(b =>
      '<tr><td>' + esc_(b.checkIn) + '</td><td>' + esc_(b.code) + '</td><td>' + esc_(roomLabel_(b.roomNo)) + '</td><td>' +
      esc_(b.guestName) + '</td><td>' + esc_(b.phone) + '</td><td>' + esc_(STATUS_TH_[b.status]) + '</td></tr>').join('');
    sendMail_(admins.join(','),
      'เตือนเช็คอิน: ลูกค้า ' + due.length + ' รายการที่ใกล้ถึงวันเข้าพัก',
      '<p>รายการเช็คอินภายในวันที่ ' + esc_(target) + '</p>' +
      '<table border="1" cellpadding="6" style="border-collapse:collapse">' +
      '<tr><th>เช็คอิน</th><th>รหัส</th><th>ห้อง</th><th>ชื่อ</th><th>โทร</th><th>สถานะ</th></tr>' + rows + '</table>');
  }
  lineNotifyReminders_(due, target);
  if (SEND_GUEST_REMINDER) {
    due.filter(b => b.email).forEach(b => sendMail_(b.email, 'เตือนวันเข้าพักที่ ' + HOTEL_NAME, guestReminderHtml_(b)));
  }
  return due.length;
}

function guestReminderHtml_(b) {
  return '<p>สวัสดีคุณ ' + esc_(b.guestName) + '</p>' +
    '<p>เราขอเตือนว่าคุณมีกำหนดเข้าพักที่ ' + HOTEL_NAME + ' วันที่ <b>' + esc_(b.checkIn) + '</b> ' +
    'ถึง ' + esc_(b.checkOut) + ' (' + b.nights + ' คืน) ' + esc_(roomLabel_(b.roomNo)) + '</p>' +
    '<p>รหัสการจอง: <b>' + esc_(b.code) + '</b></p>' +
    '<p>อย่าลืมนำสมุดวัคซีนของน้อง ๆ มาด้วยนะครับ พักผ่อนให้เต็มที่ เราดูแลส่วนที่เหลือเอง</p>';
}

function notifyBookingEvent_(type, b, reason) {
  lineNotifyBooking_(type, b, reason);
  const to = adminEmails_();
  if (!to.length) return;
  const title = type === 'new' ? 'มีการจองใหม่' : 'มีการยกเลิกการจอง';
  sendMail_(to.join(','), title + ' ' + b.code + ' · ' + roomLabel_(b.roomNo) + ' · ' + b.checkIn,
    '<p><b>' + title + '</b> (' + esc_(reason) + ')</p>' +
    '<table cellpadding="4">' +
    '<tr><td>รหัสการจอง</td><td><b>' + esc_(b.code) + '</b></td></tr>' +
    '<tr><td>ห้อง</td><td>' + esc_(roomLabel_(b.roomNo)) + '</td></tr>' +
    '<tr><td>ชื่อ-นามสกุล</td><td>' + esc_(b.guestName) + '</td></tr>' +
    '<tr><td>เบอร์โทร</td><td>' + esc_(b.phone) + '</td></tr>' +
    '<tr><td>เช็คอิน</td><td>' + esc_(b.checkIn) + '</td></tr>' +
    '<tr><td>เช็คเอาท์</td><td>' + esc_(b.checkOut) + ' (' + b.nights + ' คืน)</td></tr>' +
    '<tr><td>ผู้เข้าพัก</td><td>' + b.guests + ' คน</td></tr>' +
    (b.pets ? '<tr><td>สัตว์เลี้ยง</td><td>' + esc_(b.pets) + '</td></tr>' : '') +
    '<tr><td>ยอดรวม</td><td>' + b.totalPrice.toLocaleString('en-US') + ' บาท</td></tr>' +
    (b.payMethod ? '<tr><td>ชำระเงิน</td><td>' + esc_(PAY_METHODS[b.payMethod] || b.payMethod) + '</td></tr>' : '') +
    (b.slipUrl ? '<tr><td>สลิป</td><td><a href="' + esc_(b.slipUrl) + '">เปิดดูสลิป</a></td></tr>' : '') +
    (b.note ? '<tr><td>หมายเหตุ</td><td>' + esc_(b.note) + '</td></tr>' : '') +
    '</table>');
}

function roomLabel_(roomNo) {
  const r = readRooms_().find(x => x.roomNo === String(roomNo));
  return r && r.name ? r.name + ' (ห้อง ' + roomNo + ')' : 'ห้อง ' + roomNo;
}

function adminEmails_() {
  return readTable_('users')
    .filter(u => u.role === 'admin' && u.status === 'active' && /@/.test(String(u.email)))
    .map(u => String(u.email).replace(/^'/, ''));
}

function sendMail_(to, subject, html) {
  try {
    MailApp.sendEmail({ to: to, subject: '[' + HOTEL_NAME + '] ' + subject, htmlBody: html, name: HOTEL_NAME });
  } catch (e) {
    console.error('ส่งอีเมลไม่สำเร็จ: ' + e);   // ไม่ให้การจองล้มเพราะอีเมลส่งไม่ได้
  }
}

function reminderInfo_() {
  let on = false;
  try {
    on = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sendCheckinReminders');
  } catch (e) {}
  const lp = lineProps_();
  return { enabled: on, hour: REMINDER_HOUR, adminEmails: adminEmails_().length,
           line: { configured: !!lp.token, hasCode: !!lp.code, targets: lp.ids.length },
           quota: (function () { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } })() };
}

/* =========================================================
 * LINE MESSAGING API (แจ้งเตือนแอดมิน)
 * ตั้งค่าที่ Apps Script → Project Settings → Script properties
 *   LINE_CHANNEL_ACCESS_TOKEN  Channel access token (long-lived) จาก LINE Developers
 *   LINE_REGISTER_CODE         รหัสลับสำหรับลงทะเบียนแอดมิน (ตั้งเอง เช่น km-4821)
 *   ADMIN_PAGE_URL             (ไม่บังคับ) ลิงก์หน้า admin.html บน GitHub Pages สำหรับปุ่มในข้อความ
 * แอดมินพิมพ์ "แอดมิน <รหัส>" ในแชท OA (หรือในกลุ่มที่เชิญ OA เข้าไป) เพื่อเริ่มรับแจ้งเตือน
 * พิมพ์ "หยุดแจ้งเตือน" เพื่อเลิกรับ
 * ========================================================= */
const LINE_API_ = 'https://api.line.me/v2/bot/message/';
const LINE_MAX_TRIES_ = 5;   // ใส่รหัสผิดได้กี่ครั้งต่อชั่วโมง

function lineProps_() {
  const p = PropertiesService.getScriptProperties();
  return {
    token: String(p.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '').trim(),
    code: String(p.getProperty('LINE_REGISTER_CODE') || '').trim(),
    adminUrl: String(p.getProperty('ADMIN_PAGE_URL') || '').trim(),
    ids: String(p.getProperty('LINE_ADMIN_IDS') || '').split(',').map(x => x.trim()).filter(String)
  };
}

function saveLineIds_(ids) {
  PropertiesService.getScriptProperties().setProperty('LINE_ADMIN_IDS', ids.join(','));
}

/** รับ webhook จาก LINE: ใช้เฉพาะคำสั่งลงทะเบียน/เลิกรับแจ้งเตือน ข้อความอื่นไม่ตอบ */
function handleLineWebhook_(body) {
  const cfg = lineProps_();
  (body.events || []).forEach(ev => {
    try {
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
      const src = ev.source || {};
      const id = src.groupId || src.roomId || src.userId;
      if (!id) return;
      const text = String(ev.message.text || '').trim();
      const reg = text.match(/^(?:แอดมิน|admin)\s+(\S+)$/i);
      if (reg) {
        const cache = CacheService.getScriptCache();
        const key = 'line_try_' + id;
        const tries = Number(cache.get(key) || 0);
        if (tries >= LINE_MAX_TRIES_) return lineReply_(ev.replyToken, 'ลองผิดหลายครั้งเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่');
        if (!cfg.code || reg[1] !== cfg.code) {
          cache.put(key, String(tries + 1), 3600);
          return lineReply_(ev.replyToken, 'รหัสลงทะเบียนไม่ถูกต้อง');
        }
        const added = withLock_(() => {
          const ids = lineProps_().ids;
          if (ids.indexOf(id) >= 0) return false;
          ids.push(id);
          saveLineIds_(ids);
          return true;
        });
        return lineReply_(ev.replyToken, added
          ? 'ลงทะเบียนเรียบร้อย ' + (src.groupId ? 'กลุ่มนี้' : 'คุณ') + 'จะได้รับแจ้งเตือนการจองใหม่ การยกเลิก และสรุปลูกค้าที่จะเช็คอินพรุ่งนี้ของ ' + HOTEL_NAME + '\nพิมพ์ "หยุดแจ้งเตือน" เพื่อเลิกรับ'
          : 'ลงทะเบียนไว้แล้ว ระบบจะส่งแจ้งเตือนมาที่นี่');
      }
      if (/^(?:หยุดแจ้งเตือน|stop)$/i.test(text) && cfg.ids.indexOf(id) >= 0) {
        withLock_(() => saveLineIds_(lineProps_().ids.filter(x => x !== id)));
        return lineReply_(ev.replyToken, 'หยุดส่งแจ้งเตือนมาที่นี่แล้ว');
      }
    } catch (err) {
      console.error('LINE webhook: ' + err);
    }
  });
  return ContentService.createTextOutput('OK');
}

function lineRequest_(path, payload) {
  const token = lineProps_().token;
  if (!token) return { ok: false, error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' };
  try {
    const res = UrlFetchApp.fetch(LINE_API_ + path, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    const msg = 'LINE ' + code + ': ' + res.getContentText().slice(0, 300);
    console.error(msg);
    return { ok: false, error: msg };
  } catch (e) {
    console.error('LINE: ' + e);
    return { ok: false, error: String(e) };
  }
}

function lineReply_(replyToken, text) {
  if (replyToken) lineRequest_('reply', { replyToken: replyToken, messages: [{ type: 'text', text: text }] });
}

/** ส่งข้อความถึงแอดมินทุกคนที่ลงทะเบียนไว้ คืนจำนวนที่ส่งสำเร็จ (ไม่ทำให้การจองล้มถ้าส่งไม่ได้) */
function linePushAdmins_(messages) {
  const cfg = lineProps_();
  if (!cfg.token || !cfg.ids.length) return 0;
  return cfg.ids.reduce((n, to) => n + (lineRequest_('push', { to: to, messages: messages }).ok ? 1 : 0), 0);
}

function thShort_(s) {
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const p = String(s).slice(0, 10).split('-').map(Number);
  return p.length === 3 && p[1] ? p[2] + ' ' + m[p[1] - 1] + ' ' + String(p[0] + 543).slice(-2) : String(s);
}

function lineRow_(label, value) {
  return { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
    { type: 'text', text: label, size: 'sm', color: '#7A6E63', flex: 3 },
    { type: 'text', text: String(value || '-'), size: 'sm', color: '#47413A', flex: 7, wrap: true }
  ] };
}

function lineCard_(o) {
  const footer = (o.buttons || []).filter(x => /^https:\/\//.test(x.uri || '')).map(x => ({
    type: 'button', style: x.primary ? 'primary' : 'secondary', height: 'sm', color: x.primary ? '#47413A' : undefined,
    action: { type: 'uri', label: x.label, uri: x.uri }
  }));
  const bubble = {
    type: 'bubble',
    header: { type: 'box', layout: 'vertical', backgroundColor: o.color, paddingAll: '16px', contents: [
      { type: 'text', text: o.title, weight: 'bold', size: 'lg', color: o.textColor, wrap: true },
      { type: 'text', text: o.subtitle || HOTEL_NAME, size: 'xs', color: o.textColor, wrap: true }
    ] },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', backgroundColor: '#F6F3EE', contents: o.rows }
  };
  if (footer.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', backgroundColor: '#F6F3EE', contents: footer };
  return { type: 'flex', altText: o.alt, contents: bubble };
}

function lineNotifyBooking_(type, b, reason) {
  try {
    const isNew = type === 'new';
    const pay = b.payMethod ? (PAY_METHODS[b.payMethod] || b.payMethod) : '';
    const rows = [
      lineRow_('รหัส', b.code),
      lineRow_('ห้อง', roomLabel_(b.roomNo)),
      lineRow_('ชื่อ', b.guestName),
      lineRow_('โทร', b.phone),
      lineRow_('เข้าพัก', thShort_(b.checkIn) + ' – ' + thShort_(b.checkOut) + ' (' + b.nights + ' คืน)'),
      lineRow_('ผู้เข้าพัก', b.guests + ' คน' + (b.pets ? ' · ' + b.pets : '')),
      lineRow_('ยอดรวม', b.totalPrice ? b.totalPrice.toLocaleString('en-US') + ' บาท' : '-')
    ];
    if (pay) rows.push(lineRow_('ชำระ', pay));
    if (b.note) rows.push(lineRow_('หมายเหตุ', String(b.note).slice(0, 200)));
    const adminUrl = lineProps_().adminUrl;
    const msg = lineCard_({
      title: isNew ? 'การจองใหม่ รอตรวจสลิป' : 'ยกเลิกการจอง',
      subtitle: reason,
      color: isNew ? '#E9C46A' : '#B5443F',
      textColor: isNew ? '#3A352F' : '#FFF8F5',
      alt: (isNew ? 'จองใหม่ ' : 'ยกเลิก ') + b.code + ' · ' + b.guestName + ' · ' + thShort_(b.checkIn),
      rows: rows,
      buttons: [
        isNew && b.slipUrl ? { label: 'ดูสลิป', uri: b.slipUrl } : null,
        adminUrl ? { label: isNew ? 'เปิดแดชบอร์ดเพื่ออนุมัติ' : 'เปิดแดชบอร์ด', uri: adminUrl, primary: true } : null
      ].filter(Boolean)
    });
    linePushAdmins_([msg]);
  } catch (e) {
    console.error('LINE notify: ' + e);
  }
}

function lineNotifyReminders_(due, target) {
  try {
    if (!due.length) return;
    const rows = [];
    due.forEach((b, i) => {
      if (i) rows.push({ type: 'separator', margin: 'md', color: '#E6DDCB' });
      rows.push({ type: 'text', text: b.guestName + ' · ' + roomLabel_(b.roomNo), weight: 'bold', size: 'sm', color: '#47413A', wrap: true, margin: i ? 'md' : 'none' });
      rows.push(lineRow_('เช็คอิน', thShort_(b.checkIn) + ' (' + b.nights + ' คืน)'));
      rows.push(lineRow_('โทร', b.phone));
      rows.push(lineRow_('สถานะ', STATUS_TH_[b.status] + (b.pets ? ' · ' + b.pets : '')));
    });
    const adminUrl = lineProps_().adminUrl;
    linePushAdmins_([lineCard_({
      title: 'เตือนเช็คอิน ' + due.length + ' รายการ',
      subtitle: 'ลูกค้าที่จะเช็คอินภายใน ' + thShort_(target),
      color: '#3E6A9E', textColor: '#F6F3EE',
      alt: 'เตือนเช็คอิน: ลูกค้า ' + due.length + ' รายการ ภายใน ' + thShort_(target),
      rows: rows,
      buttons: adminUrl ? [{ label: 'เปิดแดชบอร์ด', uri: adminUrl, primary: true }] : []
    })]);
  } catch (e) {
    console.error('LINE reminder: ' + e);
  }
}

/** แอดมินกดทดสอบจากแดชบอร์ด */
function sendTestLine(token) {
  requireAdmin_(token);
  const cfg = lineProps_();
  if (!cfg.token) throw new Error('ยังไม่ได้ใส่ LINE_CHANNEL_ACCESS_TOKEN ใน Script properties');
  if (!cfg.ids.length) throw new Error('ยังไม่มีแอดมินลงทะเบียนใน LINE ให้พิมพ์ "แอดมิน <รหัส>" ในแชท LINE OA ก่อน');
  const n = linePushAdmins_([{ type: 'text', text: 'ทดสอบการแจ้งเตือนจาก ' + HOTEL_NAME + ' ระบบส่ง LINE ทำงานปกติ' }]);
  if (!n) throw new Error('ส่ง LINE ไม่สำเร็จ ตรวจสอบ Channel access token หรือโควตาข้อความของ OA');
  return 'ส่งข้อความทดสอบทาง LINE แล้ว (' + n + ' ปลายทาง)';
}

/* =========================================================
 * BOOKING HELPERS
 * ========================================================= */
const STATUS_TH_ = {
  pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', checked_in: 'เข้าพักอยู่',
  checked_out: 'เช็คเอาท์แล้ว', cancelled: 'ยกเลิก'
};

function insertBooking_(data, status, source, isAdmin, extra) {
  const d = validateBooking_(data, null, isAdmin);
  const now = new Date();
  const b = Object.assign({
    id: Utilities.getUuid(),
    code: newBookingCode_(),
    status: status,
    source: source,
    createdAt: now,
    updatedAt: now,
    reminderSent: '',
    payMethod: '',
    slipUrl: ''
  }, d, extra || {});
  sheet_('bookings').appendRow(SHEETS.bookings.headers.map(h => b[h] === undefined ? '' : b[h]));
  return b;
}

/** ตรวจข้อมูลการจอง คำนวณจำนวนคืนและราคา และเช็คว่าห้องว่าง */
function validateBooking_(data, excludeId, isAdmin) {
  data = data || {};
  const roomNo = String(data.roomNo || '').trim();
  const room = readRooms_().find(r => r.roomNo === roomNo);
  if (!room) throw new Error('กรุณาเลือกห้องพัก');
  if (room.status !== 'active') throw new Error('ห้อง ' + roomNo + ' ปิดให้บริการอยู่');

  const guestName = String(data.guestName || '').trim().slice(0, 100);
  if (guestName.length < 2) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  const phone = String(data.phone || '').trim();
  if (!/^[0-9+\-\s]{9,15}$/.test(phone)) throw new Error('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง');
  const email = String(data.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');

  const r = checkDates_(data.checkIn, data.checkOut, isAdmin);
  const guests = Math.floor(Number(data.guests || 1));
  if (!(guests >= 1)) throw new Error('จำนวนผู้เข้าพักไม่ถูกต้อง');
  if (guests > room.capacity) throw new Error(roomLabel_(roomNo) + ' รับได้สูงสุด ' + room.capacity + ' คน');

  const hold = isAdmin ? null : findHoldConflict_(roomNo, r.checkIn, r.checkOut, data.holdId || null);
  if (hold) throw new Error('มีลูกค้าท่านอื่นกำลังจอง' + room.name + 'ในช่วงวันที่นี้ ลองใหม่อีกครั้งในไม่กี่นาที หรือเลือกวันอื่น');
  const conflict = findConflict_(readTable_('bookings'), roomNo, r.checkIn, r.checkOut, excludeId);
  if (conflict) {
    throw new Error(isAdmin
      ? 'ห้อง ' + roomNo + ' ไม่ว่างในช่วงวันที่นี้ (ชนกับการจอง ' + conflict.code + ' ' +
        strDate_(conflict.checkIn) + ' ถึง ' + strDate_(conflict.checkOut) + ')'
      : 'ขออภัย ' + room.name + ' เพิ่งถูกจองในช่วงวันที่นี้ กรุณาเลือกวันหรือห้องอื่น');
  }

  return {
    roomNo: roomNo,
    guestName: safe_(guestName),
    phone: safe_(phone),
    email: safe_(email),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
    guests: guests,
    totalPrice: r.nights * room.pricePerNight,
    note: safe_(String(data.note || '').trim().slice(0, 500)),
    pets: safe_(String(data.pets || '').trim().slice(0, 50))
  };
}

function checkDates_(checkIn, checkOut, allowPast) {
  checkIn = strDate_(checkIn);
  checkOut = strDate_(checkOut);
  if (!isDate_(checkIn) || !isDate_(checkOut)) throw new Error('กรุณาเลือกวันเช็คอินและเช็คเอาท์');
  if (!allowPast && checkIn < today_()) throw new Error('วันเช็คอินต้องไม่ใช่วันที่ผ่านมาแล้ว');
  const nights = daysBetween_(checkIn, checkOut);
  if (nights < 1) throw new Error('วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน');
  if (nights > MAX_NIGHTS) throw new Error('จองได้ครั้งละไม่เกิน ' + MAX_NIGHTS + ' คืน');
  return { checkIn: checkIn, checkOut: checkOut, nights: nights };
}

/** ช่วงวันที่ทับกันเมื่อ เช็คอินใหม่ < เช็คเอาท์เดิม และ เช็คเอาท์ใหม่ > เช็คอินเดิม */
function findConflict_(bookings, roomNo, checkIn, checkOut, excludeId) {
  return bookings.find(b =>
    b.id !== excludeId &&
    String(b.roomNo) === roomNo &&
    BLOCKING_STATUSES.indexOf(b.status) >= 0 &&
    checkIn < strDate_(b.checkOut) && checkOut > strDate_(b.checkIn)) || null;
}

function newBookingCode_() {
  const existing = {};
  readTable_('bookings').forEach(b => existing[b.code] = true);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = 'KM' + Utilities.formatDate(new Date(), tz_(), 'yyMMdd');
  for (let n = 0; n < 20; n++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!existing[prefix + s]) return prefix + s;
  }
  throw new Error('สร้างรหัสการจองไม่สำเร็จ ลองใหม่อีกครั้ง');
}

function readRooms_() {
  return readTable_('rooms')
    .filter(r => String(r.roomNo).trim())
    .map(r => ({
      roomNo: String(r.roomNo).trim(),
      name: String(r.name || ''),
      type: String(r.type || ''),
      pricePerNight: Number(r.pricePerNight) || 0,
      capacity: Number(r.capacity) || 1,
      status: r.status === 'inactive' ? 'inactive' : 'active'
    }));
}

function publicBooking_(b) {
  return {
    id: b.id, code: String(b.code), roomNo: String(b.roomNo),
    guestName: unsafe_(b.guestName), phone: unsafe_(b.phone), email: unsafe_(b.email),
    checkIn: strDate_(b.checkIn), checkOut: strDate_(b.checkOut),
    nights: Number(b.nights) || 0, guests: Number(b.guests) || 0, totalPrice: Number(b.totalPrice) || 0,
    status: String(b.status), note: unsafe_(b.note), source: String(b.source || ''),
    createdAt: fmt_(b.createdAt), updatedAt: fmt_(b.updatedAt), reminderSent: fmt_(b.reminderSent),
    pets: unsafe_(b.pets), payMethod: String(b.payMethod || ''), slipUrl: String(b.slipUrl || ''),
    confirmedAt: fmt_(b.confirmedAt)
  };
}

function appendNote_(note, text) {
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  return safe_((unsafe_(note) ? unsafe_(note) + ' | ' : '') + text + ' (' + stamp + ')');
}

function normPhone_(p) {
  return String(p || '').replace(/^'/, '').replace(/[^0-9+]/g, '');
}

/* =========================================================
 * DATE HELPERS (เก็บวันที่เป็นข้อความ yyyy-MM-dd เพื่อเลี่ยงปัญหาเขตเวลา)
 * ========================================================= */
function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
}

function today_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function strDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v || '').replace(/^'/, '').trim().slice(0, 10);
}

function isDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function utc_(s) {
  const p = s.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

function daysBetween_(a, b) {
  return Math.round((utc_(b) - utc_(a)) / 86400000);
}

function addDays_(s, n) {
  return new Date(utc_(s) + n * 86400000).toISOString().slice(0, 10);
}

function addMonths_(ym, n) {
  const p = ym.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/* =========================================================
 * SHEET HELPERS
 * ========================================================= */
const HEADERS_OK_ = {};
function sheet_(key) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[key].name);
  if (!sh) throw new Error('ไม่พบแท็บ ' + SHEETS[key].name + ' ให้รันฟังก์ชัน setup ก่อน');
  if (!HEADERS_OK_[key]) {
    // เติมหัวคอลัมน์ใหม่ที่เพิ่มในเวอร์ชันหลัง ๆ ให้อัตโนมัติ (ต่อท้าย ไม่แตะข้อมูลเดิม)
    const headers = SHEETS[key].headers;
    const width = Math.max(sh.getLastColumn(), 1);
    const current = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
    if (current[0] === headers[0]) {
      headers.forEach((h, i) => { if (!current[i]) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold'); });
    }
    HEADERS_OK_[key] = true;
  }
  return sh;
}

/** อ่านทั้งแท็บเป็น object ตามหัวคอลัมน์ในแถวแรก */
function readTable_(key) {
  const values = sheet_(key).getDataRange().getValues();
  const head = values.shift() || [];
  return values
    .map((r, i) => {
      const o = { _row: i + 2 };
      head.forEach((h, j) => { if (h) o[h] = r[j]; });
      o._orig = Object.assign({}, o);
      return o;
    })
    .filter(o => head.some(h => h && o[h] !== '' && o[h] !== null));
}

/** เขียนทั้งแถวกลับตามลำดับหัวคอลัมน์ */
function writeRow_(key, o) {
  const headers = SHEETS[key].headers;
  sheet_(key).getRange(o._row, 1, 1, headers.length)
    .setValues([headers.map(h => o[h] === undefined || o[h] === null ? '' : o[h])]);
}

function setCell_(key, row, field, value) {
  sheet_(key).getRange(row, SHEETS[key].headers.indexOf(field) + 1).setValue(value);
}

/* =========================================================
 * USER HELPERS
 * ========================================================= */
function findUser_(pred) {
  return readTable_('users').map(u => { u.username = String(u.username); return u; }).find(pred) || null;
}

function insertUser_(d) {
  const salt = Utilities.getUuid();
  const row = {
    id: Utilities.getUuid(),
    username: d.username,
    passwordHash: hash_(d.password, salt),
    salt: salt,
    fullname: safe_(d.fullname),
    email: safe_(d.email),
    role: d.role,
    status: d.status,
    createdAt: new Date(),
    lastLogin: ''
  };
  sheet_('users').appendRow(SHEETS.users.headers.map(h => row[h]));
}

function setPassword_(u, password) {
  u.salt = Utilities.getUuid();
  u.passwordHash = hash_(password, u.salt);
  writeRow_('users', u);
}

/** SHA-256 + salt (ห้ามเก็บรหัสผ่านเป็นข้อความธรรมดา) */
function hash_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function validateUser_(d, isNew) {
  d = d || {};
  const out = {};
  if (isNew) {
    out.username = String(d.username || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]{2,29}$/.test(out.username)) {
      throw new Error('ชื่อผู้ใช้ต้องขึ้นต้นด้วยตัวอักษร ใช้ a-z 0-9 . _ - ยาว 3–30 ตัว');
    }
  }
  out.fullname = safe_(String(d.fullname || '').trim().slice(0, 100));
  out.email = String(d.email || '').trim();
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  out.email = safe_(out.email);
  out.role = ROLES.indexOf(d.role) >= 0 ? d.role : 'user';
  out.status = d.status === 'inactive' ? 'inactive' : 'active';
  return out;
}

function checkPassword_(p) {
  if (String(p || '').length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
}

function publicUser_(u) {
  // ไม่ส่ง passwordHash/salt ออกไปฝั่ง client
  return {
    id: u.id, username: String(u.username), fullname: unsafe_(u.fullname), email: unsafe_(u.email),
    role: u.role, status: u.status,
    createdAt: fmt_(u.createdAt), lastLogin: fmt_(u.lastLogin)
  };
}

/* =========================================================
 * COMMON
 * ========================================================= */
/** กัน Formula injection ในชีต (ค่าที่ขึ้นต้นด้วย = + - @) */
function safe_(s) {
  s = String(s || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** คืนค่าที่ผ่าน safe_ มาให้เป็นข้อความเดิม (ตัด ' ที่เติมไว้กันสูตรออก) */
function unsafe_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/^'(?=[=+\-@])/, '');
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt_(d) {
  return d instanceof Date
    ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm')
    : String(d || '');
}

/** ป้องกันการเขียนชนกันเมื่อมีหลายคนใช้งานพร้อมกัน (สำคัญมากตอนจองห้องเดียวกันพร้อมกัน) */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
