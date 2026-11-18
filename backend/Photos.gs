/**********************************************************
 * Khun Mee: จัดการรูปห้องพักจากหลังบ้าน (Photos.gs)
 *
 * แอดมินเพิ่ม ลบ เรียงลำดับ และตั้งรูปปกของแต่ละห้องได้จากหน้า admin.html ส่วน "รูปภาพ"
 * หน้าเว็บลูกค้า (หน้าแรก หน้าจอง) ดึงรายการรูปจากที่นี่ ถ้ายังไม่ได้ตั้งค่าจะใช้รูปเดิมในเว็บ
 *
 * เก็บรูป: Google Drive โฟลเดอร์ "Khun Mee · รูปห้องพัก" (แชร์แบบทุกคนที่มีลิงก์ดูได้ เพราะเป็นรูปสาธารณะบนเว็บ)
 * เก็บรายการ: แท็บ Photos ใน Google Sheets (1 แถวต่อ 1 รูป)
 *
 * ติดตั้ง
 *   1) Apps Script กด + → Script ตั้งชื่อ Photos แล้ววางโค้ดทั้งไฟล์นี้ (ไว้ล่างสุดในรายการไฟล์)
 *   2) เลือกฟังก์ชัน setupPhotos แล้วกด Run 1 ครั้ง (อนุญาตสิทธิ์ Google Drive ถ้าถูกถาม)
 *   3) Deploy → Manage deployments → แก้ไข → Version: New version แล้วกด Deploy
 *   4) เปิดหลังบ้าน ส่วน "รูปภาพ" กด "นำเข้ารูปเดิมของเว็บ" 1 ครั้ง แล้วจัดการรูปได้เลย
 *
 * ชุดรูป (คอลัมน์ set)
 *   room:<เลขห้อง>  รูปของห้องนั้น (รูปที่ cover = TRUE คือรูปปก แสดงบนการ์ดห้องและหน้าจอง)
 *   extra           รูปที่ต่อท้ายทุกห้อง (เช่น ห้องน้ำในตัว)
 *   living          พื้นที่ส่วนกลาง (ห้องนั่งเล่นที่ทุกคนใช้ร่วมกัน)
 *   hero / quote / map   รูปเดี่ยวในหน้าแรก (รูปใหญ่ด้านบน, พื้นหลังคำพูดเจ้าของบ้าน, แผนที่) อัปโหลดใหม่ = แทนรูปเดิม
 *   tour            วิดีโอชมบรรยากาศ 1 คลิป (ลิงก์ YouTube) แสดงเป็นส่วน "ชมบรรยากาศ" ในหน้าแรก
 * วิดีโอ: วางลิงก์ YouTube (ตั้งเป็น Unlisted ได้) ใส่ได้ในชุดห้อง พื้นที่ส่วนกลาง และ tour · เก็บในคอลัมน์ src เป็น yt:<รหัสวิดีโอ>
 **********************************************************/

const PH_FOLDER_NAME = 'Khun Mee · รูปห้องพัก';
const PH_MAX_BYTES = 4 * 1024 * 1024;       // ไฟล์ละไม่เกิน 4 MB (หน้าเว็บย่อรูปก่อนส่งอยู่แล้ว)
const PH_MAX_PER_SET = 30;                  // รูปสูงสุดต่อชุด
// ลิงก์รูปจาก Google Drive · {id} = รหัสไฟล์, {w} = ความกว้าง
const PH_URL_FMT = 'https://lh3.googleusercontent.com/d/{id}=w{w}';
// รูปเดิมของเว็บ (ใช้ตอนกด "นำเข้ารูปเดิมของเว็บ") ตรงกับ js/config.js
const PH_DEFAULTS = {
  'room:1': ['images/room-shoji.jpg'],
  'room:2': ['images/room-hinoki.jpg'],
  'room:3': ['images/room-yane-1.jpg', 'images/room-yane-2.jpg', 'images/room-yane-3.webp'],
  'room:4': ['images/room-komorebi.jpg'],
  extra: ['images/bathroom-1.jpg', 'images/bathroom-2.jpg'],
  living: ['images/reception-1.jpg', 'images/reception-2.jpg', 'images/reception-3.jpg', 'images/reception-4.jpg', 'images/bathroom-1.jpg', 'images/bathroom-2.jpg']
};

// รูปเดี่ยวในหน้าแรก (อัปโหลดใหม่แทนรูปเดิม) · ยังไม่ได้ตั้ง = ใช้รูปเดิมของเว็บ
const PH_SINGLE = {
  hero: { label: 'รูปใหญ่ด้านบนหน้าแรก', fallback: 'images/exterior-day.jpg' },
  quote: { label: 'พื้นหลังคำพูดเจ้าของบ้าน', fallback: 'images/exterior-night.jpg' },
  map: { label: 'แผนที่', fallback: 'images/map-khunmee.jpg' }
};
const PH_TOUR_LABEL = 'วิดีโอชมบรรยากาศ';

SHEETS.photos = {
  name: 'Photos',
  headers: ['id', 'set', 'fileId', 'src', 'order', 'cover', 'name', 'createdAt', 'createdBy']
};

Object.assign(API_ACTIONS, {
  publicGallery: publicGallery,
  adminPhotoList: adminPhotoList,
  adminPhotoUpload: adminPhotoUpload,
  adminPhotoDelete: adminPhotoDelete,
  adminPhotoMove: adminPhotoMove,
  adminPhotoCover: adminPhotoCover,
  adminPhotoImport: adminPhotoImport,
  adminPhotoAddVideo: adminPhotoAddVideo
});

/** รันครั้งเดียวจากหน้า Apps Script: สร้างแท็บ Photos และโฟลเดอร์รูปใน Google Drive */
function setupPhotos() {
  phSheet_();
  const folder = phFolder_();
  phBump_();
  Logger.log('พร้อมใช้งานแล้ว: แท็บ Photos และโฟลเดอร์รูป ' + folder.getUrl());
  Logger.log('ต่อไป: Deploy → Manage deployments → New version แล้วเปิดหลังบ้าน ส่วน "รูปภาพ"');
}

/* =========================================================
 * หน้าเว็บลูกค้า
 * ========================================================= */
/**
 * รายการรูปทุกชุด { managed, sets: { 'room:1': [{ src, full }], extra: [...], living: [...] }, covers: { '1': src } }
 * managed = false (ยังไม่มีรูปในแท็บ Photos) หน้าเว็บจะใช้รูปเดิมใน js/config.js
 */
function publicGallery() {
  return phCached_(() => {
    let rows;
    try { rows = phRows_(); } catch (e) { return { managed: false, sets: {}, covers: {} }; }
    if (!rows.length) return { managed: false, sets: {}, covers: {} };
    const sets = {}, covers = {};
    phSort_(rows).forEach(r => {
      (sets[r.set] = sets[r.set] || []).push(phView_(r, 1600));
      if (r.cover && !phIsVideo_(r) && /^room:/.test(r.set)) covers[r.set.slice(5)] = phView_(r, 1600);
    });
    Object.keys(sets).forEach(k => {
      const img = sets[k].filter(x => !/^yt:/.test(x))[0];
      if (/^room:/.test(k) && !covers[k.slice(5)] && img) covers[k.slice(5)] = img;
    });
    // imported = ชุดรูปห้อง/ห้องน้ำ/พื้นที่ส่วนกลางถูกจัดการจากหลังบ้านแล้ว (ชุดว่าง = ว่างจริง)
    return { managed: true, imported: phImported_(rows), sets: sets, covers: covers };
  });
}

/* =========================================================
 * แอดมิน
 * ========================================================= */
function adminPhotoList(token) {
  requireAdmin_(token);
  const rows = phSort_(phRows_());
  const rooms = readRooms_();
  const defs = rooms.map(r => ({ key: 'room:' + r.roomNo, label: (r.name || 'ห้อง ' + r.roomNo), room: true }))
    .concat([{ key: 'extra', label: 'ห้องน้ำ (ต่อท้ายทุกห้อง)', room: false },
             { key: 'living', label: 'พื้นที่ส่วนกลาง', room: false }])
    .concat(Object.keys(PH_SINGLE).map(k => ({ key: k, label: PH_SINGLE[k].label, room: false, single: true, fallback: PH_SINGLE[k].fallback })))
    .concat([{ key: 'tour', label: PH_TOUR_LABEL, room: false, single: true, videoOnly: true }]);
  const known = defs.map(d => d.key);
  rows.forEach(r => { if (known.indexOf(r.set) < 0) { known.push(r.set); defs.push({ key: r.set, label: r.set, room: /^room:/.test(r.set) }); } });
  let folderUrl = '';
  try { folderUrl = phFolder_().getUrl(); } catch (e) {}
  return {
    managed: rows.length > 0,
    imported: phImported_(rows),
    folderUrl: folderUrl,
    maxPerSet: PH_MAX_PER_SET,
    sets: defs.map(d => ({
      key: d.key, label: d.label, room: d.room, single: !!d.single, fallback: d.fallback || '',
      videoOnly: !!d.videoOnly, video: phVideoSet_(d.key), gallery: phGallerySet_(d.key),
      photos: rows.filter(r => r.set === d.key).map(r => ({
        id: r.id, cover: r.cover && !phIsVideo_(r), name: r.name, drive: !!r.fileId, video: phIsVideo_(r),
        thumb: phThumb_(r), full: phView_(r, 1600)
      }))
    }))
  };
}

/** อัปโหลดรูป 1 รูป file: { name, mimeType, base64 } (หน้าเว็บย่อรูปเป็น JPEG ก่อนส่ง) */
function adminPhotoUpload(token, set, file) {
  const me = requireAdmin_(token);
  set = phCheckSet_(set);
  if (set === 'tour') throw new Error('ชุดนี้ใช้ลิงก์ YouTube กรุณาวางลิงก์วิดีโอแทน');
  if (phGallerySet_(set) && !phImported_(phRows_())) throw new Error('กด "นำเข้ารูปเดิมของเว็บ" ก่อน แล้วค่อยเพิ่มรูปในชุดนี้');
  if (!file || !file.base64) throw new Error('ไม่พบไฟล์รูป');
  const mime = String(file.mimeType || '');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!ext) throw new Error('รองรับเฉพาะรูป JPG, PNG หรือ WebP');
  const bytes = Utilities.base64Decode(String(file.base64).replace(/^data:[^,]*,/, ''));
  if (bytes.length < 1000) throw new Error('ไฟล์รูปไม่สมบูรณ์ กรุณาเลือกใหม่');
  if (bytes.length > PH_MAX_BYTES) throw new Error('รูปใหญ่เกินไป (ไม่เกิน 4 MB)');
  if (phRows_().filter(r => r.set === set).length >= PH_MAX_PER_SET) throw new Error('ชุดนี้มีรูปครบ ' + PH_MAX_PER_SET + ' รูปแล้ว ลบรูปเก่าก่อน');

  const base = String(file.name || 'photo').replace(/\.[^.]+$/, '').replace(/[^\w\-ก-๙ ]+/g, '').trim().slice(0, 40) || 'photo';
  const fname = set.replace(':', '-') + '_' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd_HHmmss') + '_' + base + '.' + ext;
  const f = phFolder_().createFile(Utilities.newBlob(bytes, mime, fname));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.error('แชร์รูป: ' + e); }

  try {
    return withLock_(() => {
      const rows = phRows_().filter(r => r.set === set);
      const order = rows.reduce((m, r) => Math.max(m, r.order), 0) + 1;
      const row = { id: Utilities.getUuid(), set: set, fileId: f.getId(), src: '', order: order,
                    cover: /^room:/.test(set) && !rows.some(r => r.cover), name: safe_(base),
                    createdAt: new Date(), createdBy: safe_(unsafe_(me.fullname) || me.username) };
      sheet_('photos').appendRow(SHEETS.photos.headers.map(h => row[h] === undefined ? '' : row[h]));
      if (PH_SINGLE[set]) phDropOthers_(set, row.id);   // รูปเดี่ยว: แทนรูปเดิม
      phBump_();
      return { id: row.id, thumb: phView_(row, 480) };
    });
  } catch (err) {
    try { f.setTrashed(true); } catch (e) {}
    throw err;
  }
}

/** ลบรูป (ไฟล์ที่อัปโหลดผ่านระบบจะถูกย้ายไปถังขยะของ Google Drive กู้คืนได้ 30 วัน) */
function adminPhotoDelete(token, id) {
  requireAdmin_(token);
  const r = withLock_(() => {
    const all = phRows_();
    const x = all.find(p => p.id === String(id));
    if (!x) throw new Error('ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)');
    sheet_('photos').deleteRow(x._row);
    if (x.cover) {   // ลบรูปปก: ให้รูปแรกที่เหลือเป็นรูปปกแทน
      const next = phSort_(phRows_().filter(p => p.set === x.set && !phIsVideo_(p)))[0];
      if (next) phSetCell_(next._row, 'cover', true);
    }
    phBump_();
    return x;
  });
  if (r.fileId) { try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) { console.error('ลบไฟล์รูป: ' + e); } }
  return 'ลบรูปแล้ว';
}

/** เลื่อนลำดับรูปในชุด dir = -1 (ขึ้นก่อน) | 1 (ไปทีหลัง) */
function adminPhotoMove(token, id, dir) {
  requireAdmin_(token);
  dir = Number(dir) < 0 ? -1 : 1;
  return withLock_(() => {
    const all = phRows_();
    const x = all.find(p => p.id === String(id));
    if (!x) throw new Error('ไม่พบรูปนี้');
    const list = phSort_(all.filter(p => p.set === x.set));
    const i = list.findIndex(p => p.id === x.id), j = i + dir;
    if (j < 0 || j >= list.length) return 'ok';
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach((p, k) => { if (p.order !== k + 1) phSetCell_(p._row, 'order', k + 1); });
    phBump_();
    return 'ok';
  });
}

/** ตั้งรูปปกของห้อง (แสดงบนการ์ดห้องในหน้าแรกและในหน้าจอง) */
function adminPhotoCover(token, id) {
  requireAdmin_(token);
  return withLock_(() => {
    const all = phRows_();
    const x = all.find(p => p.id === String(id));
    if (!x) throw new Error('ไม่พบรูปนี้');
    if (!/^room:/.test(x.set)) throw new Error('ตั้งรูปปกได้เฉพาะรูปห้องพัก');
    if (phIsVideo_(x)) throw new Error('รูปปกต้องเป็นรูปภาพ ไม่ใช่วิดีโอ');
    all.filter(p => p.set === x.set).forEach(p => { if (p.cover !== (p.id === x.id)) phSetCell_(p._row, 'cover', p.id === x.id); });
    phBump_();
    return 'ตั้งเป็นรูปปกแล้ว';
  });
}

/** นำรูปเดิมของเว็บเข้าระบบ (ทำได้เมื่อแท็บ Photos ยังว่าง) */
function adminPhotoImport(token) {
  const me = requireAdmin_(token);
  return withLock_(() => {
    const sh = sheet_('photos'), now = new Date(), by = safe_(unsafe_(me.fullname) || me.username);
    const out = [];
    Object.keys(PH_DEFAULTS).forEach(set => {
      PH_DEFAULTS[set].forEach((src, i) => {
        const row = { id: Utilities.getUuid(), set: set, fileId: '', src: src, order: i + 1,
                      cover: /^room:/.test(set) && i === 0, name: src.replace(/^.*\//, ''), createdAt: now, createdBy: by };
        out.push(SHEETS.photos.headers.map(h => row[h] === undefined ? '' : row[h]));
      });
    });
    if (phImported_(phRows_())) throw new Error('มีรูปในระบบแล้ว นำเข้าซ้ำไม่ได้');
    sh.getRange(sh.getLastRow() + 1, 1, out.length, SHEETS.photos.headers.length).setValues(out);
    PropertiesService.getScriptProperties().setProperty('PHOTO_IMPORTED', '1');
    phBump_();
    return 'นำเข้ารูปเดิม ' + out.length + ' รูปแล้ว';
  });
}

/** เพิ่มวิดีโอจากลิงก์ YouTube (youtu.be/…, youtube.com/watch?v=…, /shorts/…) */
function adminPhotoAddVideo(token, set, url) {
  const me = requireAdmin_(token);
  set = phCheckSet_(set);
  if (!phVideoSet_(set)) throw new Error('ชุดนี้ใส่วิดีโอไม่ได้ (ใส่ได้ในชุดห้องพัก พื้นที่ส่วนกลาง และวิดีโอชมบรรยากาศ)');
  if (phGallerySet_(set) && !phImported_(phRows_())) throw new Error('กด "นำเข้ารูปเดิมของเว็บ" ก่อน แล้วค่อยเพิ่มวิดีโอในชุดนี้');
  const id = phYouTubeId_(url);
  if (!id) throw new Error('ลิงก์ไม่ถูกต้อง กรุณาวางลิงก์ YouTube เช่น https://youtu.be/xxxxxxxxxxx');
  return withLock_(() => {
    const rows = phRows_().filter(r => r.set === set);
    if (rows.some(r => r.src === 'yt:' + id)) throw new Error('มีวิดีโอนี้ในชุดแล้ว');
    if (rows.length >= PH_MAX_PER_SET) throw new Error('ชุดนี้มีรูปครบ ' + PH_MAX_PER_SET + ' รายการแล้ว');
    const row = { id: Utilities.getUuid(), set: set, fileId: '', src: 'yt:' + id, order: rows.reduce((m, r) => Math.max(m, r.order), 0) + 1,
                  cover: false, name: 'YouTube ' + id, createdAt: new Date(), createdBy: safe_(unsafe_(me.fullname) || me.username) };
    sheet_('photos').appendRow(SHEETS.photos.headers.map(h => row[h] === undefined ? '' : row[h]));
    if (set === 'tour') phDropOthers_(set, row.id);   // วิดีโอชมบรรยากาศมีได้คลิปเดียว
    phBump_();
    return 'เพิ่มวิดีโอแล้ว';
  });
}

/* =========================================================
 * ภายใน
 * ========================================================= */
// ใช้แคชหน้าเว็บลูกค้าของ Code.gs ถ้ามี (ล้างทุกครั้งที่แก้รูป)
function phCached_(fn) { return typeof pubCached_ === 'function' ? pubCached_('gallery', fn) : fn(); }
function phBump_() { if (typeof bumpPublicCache_ === 'function') bumpPublicCache_(); }

function phSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEETS.photos.name);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.photos.name);
    sh.appendRow(SHEETS.photos.headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SHEETS.photos.headers.length).setFontWeight('bold');
  }
  return sh;
}

function phFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  let folder = null;
  if (id) { try { folder = DriveApp.getFolderById(id); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder(PH_FOLDER_NAME);
    props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  }
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.error('แชร์โฟลเดอร์รูป: ' + e); }
  return folder;
}

function phRows_() {
  phSheet_();
  return readTable_('photos').filter(r => String(r.id).trim()).map(r => ({
    _row: r._row, id: String(r.id), set: String(r.set).trim(), fileId: String(r.fileId || '').trim(),
    src: String(r.src || '').trim(), order: Number(r.order) || 0,
    cover: r.cover === true || String(r.cover).toUpperCase() === 'TRUE', name: unsafe_(r.name)
  }));
}

function phSort_(rows) { return rows.slice().sort((a, b) => a.order - b.order || a._row - b._row); }

function phIsVideo_(r) { return /^yt:/.test(r.src); }
function phThumb_(r) { return phIsVideo_(r) ? 'https://i.ytimg.com/vi/' + r.src.slice(3) + '/hqdefault.jpg' : phView_(r, 480); }
function phGallerySet_(k) { return /^room:/.test(k) || k === 'extra' || k === 'living'; }
function phVideoSet_(k) { return /^room:/.test(k) || k === 'living' || k === 'tour'; }
function phImported_(rows) {
  return PropertiesService.getScriptProperties().getProperty('PHOTO_IMPORTED') === '1' || rows.some(r => phGallerySet_(r.set));
}
function phYouTubeId_(url) {
  const u = String(url || '').trim();
  const m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})(?![\w-])/i);
  return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '');
}
/** ลบรายการอื่นในชุด (ใช้กับรูปเดี่ยวและวิดีโอชมบรรยากาศ) ไฟล์ใน Drive ย้ายไปถังขยะ */
function phDropOthers_(set, keepId) {
  phRows_().filter(r => r.set === set && r.id !== keepId).sort((a, b) => b._row - a._row).forEach(r => {
    sheet_('photos').deleteRow(r._row);
    if (r.fileId) { try { DriveApp.getFileById(r.fileId).setTrashed(true); } catch (e) {} }
  });
}

function phView_(r, w) {
  if (phIsVideo_(r)) return r.src;
  if (r.fileId) return PH_URL_FMT.replace('{id}', encodeURIComponent(r.fileId)).replace('{w}', String(w));
  return r.src;
}

function phSetCell_(row, field, value) {
  sheet_('photos').getRange(row, SHEETS.photos.headers.indexOf(field) + 1).setValue(value);
}

function phCheckSet_(set) {
  set = String(set || '').trim();
  if (set === 'extra' || set === 'living' || set === 'tour' || PH_SINGLE[set]) return set;
  const m = set.match(/^room:(\S+)$/);
  if (m && readRooms_().some(r => r.roomNo === m[1])) return set;
  throw new Error('ไม่พบชุดรูปนี้');
}
