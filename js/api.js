/* เรียก Google Apps Script Web API
 * ใช้ Content-Type text/plain เพื่อไม่ให้เบราว์เซอร์ส่ง preflight (Apps Script ไม่รองรับ OPTIONS) */
(function () {
  'use strict';
  var cfg = window.KM_CONFIG || {};

  window.kmApi = function (action) {
    var args = Array.prototype.slice.call(arguments, 1);
    var url = cfg.API_URL || '';
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
      return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API_URL ในไฟล์ js/config.js'));
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args }),
      redirect: 'follow'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('เชื่อมต่อระบบไม่สำเร็จ (' + r.status + ')');
        return r.json();
      }, function () {
        throw new Error('เชื่อมต่อระบบไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
      })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'เกิดข้อผิดพลาด');
        return j.data;
      });
  };

  /* ส่งแบบไม่รอผล ใช้ตอนปิดหน้า (เช่น ปล่อยห้องที่กันไว้) */
  window.kmApiBeacon = function (action) {
    var args = Array.prototype.slice.call(arguments, 1);
    var url = cfg.API_URL || '';
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return;
    var body = JSON.stringify({ action: action, args: args });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) {}
    try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true, mode: 'no-cors' }); } catch (e) {}
  };

  window.kmToken = {
    get: function () { try { return sessionStorage.getItem('km_token'); } catch (e) { return null; } },
    set: function (t) { try { t ? sessionStorage.setItem('km_token', t) : sessionStorage.removeItem('km_token'); } catch (e) {} },
    getUser: function () { try { return JSON.parse(sessionStorage.getItem('km_user') || 'null'); } catch (e) { return null; } },
    setUser: function (u) { try { u ? sessionStorage.setItem('km_user', JSON.stringify(u)) : sessionStorage.removeItem('km_user'); } catch (e) {} }
  };

  window.kmRoomImage = function (roomNo) {
    var m = cfg.ROOM_IMAGES || {};
    return m[String(roomNo)] || cfg.DEFAULT_ROOM_IMAGE || '';
  };

  /* วันที่แบบ yyyy-mm-dd ไม่ขึ้นกับเขตเวลา */
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TH_DF = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  function parts(s) { return String(s).slice(0, 10).split('-').map(Number); }
  function utc(s) { var p = parts(s); return Date.UTC(p[0], p[1] - 1, p[2]); }
  window.kmDate = {
    utc: utc,
    add: function (s, n) { return new Date(utc(s) + n * 86400000).toISOString().slice(0, 10); },
    diff: function (a, b) { return Math.round((utc(b) - utc(a)) / 86400000); },
    weekday: function (s) { return new Date(utc(s)).getUTCDay(); },
    ym: function (y, m) { return y + '-' + String(m).padStart(2, '0'); },
    monthStart: function (y, m) { return y + '-' + String(m).padStart(2, '0') + '-01'; },
    daysIn: function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); },
    short: function (s) { if (!s) return '—'; var p = parts(s); return TH_D[new Date(utc(s)).getUTCDay()] + ' ' + p[2] + ' ' + TH_M[p[1] - 1] + ' ' + String(p[0] + 543).slice(-2); },
    dm: function (s) { if (!s) return '—'; var p = parts(s); return p[2] + ' ' + TH_M[p[1] - 1]; },
    long: function (s) { var p = parts(s); return 'วัน' + TH_DF[new Date(utc(s)).getUTCDay()] + 'ที่ ' + p[2] + ' ' + TH_MF[p[1] - 1] + ' ' + (p[0] + 543); },
    monthTitle: function (y, m) { return TH_MF[m - 1] + ' ' + (y + 543); }
  };
  window.kmMoney = function (n) { return Number(n || 0).toLocaleString('th-TH'); };
})();
