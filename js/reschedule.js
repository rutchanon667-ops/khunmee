/* Khun Mhee: ระบบเลื่อนวันพัก (เลื่อนได้ครั้งเดียวต่อการจอง)
 *
 * ติดตั้ง: วางไฟล์นี้ที่ js/reschedule.js แล้วเพิ่มบรรทัดนี้ใน index.html, booking.html และ admin.html
 *   <script src="js/reschedule.js"></script>
 * ต่อจากบรรทัด <script src="js/api.js"></script> (ก่อนสคริปต์ของหน้า)
 * ต้องติดตั้ง Reschedule.gs ใน Apps Script ด้วย ถ้ายังไม่ติดตั้ง ส่วนเลื่อนวันพักจะไม่แสดง (หน้าอื่นทำงานปกติ)
 *
 * หน้าแรก: ปุ่ม "เลื่อนวันพัก" (แถบเมนู ใต้กล่องค้นหาห้องว่าง และส่วนท้าย) เปิดกล่องค้นหาการจองด้วยรหัส + เบอร์โทร
 * หน้าจอง (ลูกค้า): การ์ด "เลื่อนวันพัก" ในหน้ารออนุมัติและหน้ายืนยันแล้ว เลือกวันเช็คอินใหม่จากปฏิทินห้องว่าง
 * แดชบอร์ด (แอดมิน): ปุ่ม "เลื่อนวัน" ในตารางการจอง เปิดปฏิทินที่วันไม่ว่างเป็นสีแดง ป้าย "เลื่อนวันแล้ว" และรายละเอียดในปฏิทิน
 */
(function () {
  'use strict';
  if (!window.DC || !window.DC.mount) return;

  var PURPLE = '#5B4B8A', PURPLE_SOFT = '#EEEAF5', PURPLE_INK = '#46386E';
  var RS_STATUSES = ['pending', 'confirmed'];
  var ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + PURPLE + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path><path d="M9 15.5h6M13 13.5l2 2-2 2"></path></svg>';
  var CHEV_L = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>';
  var CHEV_R = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>';

  /* ---------- ค้นหาใน <template> ที่ซ้อนกัน ---------- */
  function deepFind(frag, sel) {
    var hit = frag.querySelector(sel);
    if (hit) return hit;
    var tpls = frag.querySelectorAll('template');
    for (var i = 0; i < tpls.length; i++) { hit = deepFind(tpls[i].content, sel); if (hit) return hit; }
    return null;
  }
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html; return t.content; }
  function after(node, html) { node.parentNode.insertBefore(frag(html), node.nextSibling); }

  /* =========================================================
   * หน้าจองห้องพัก (ลูกค้า)
   * ========================================================= */
  var BOOKING_HTML =
'<template data-sc="if" value="{{rsShow}}" hint-placeholder-val="{{ false }}">' +
'<section aria-labelledby="h-rs" style="background: #F6F3EE; border-radius: 18px; padding: 28px 32px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px">' +
'<div style="display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap">' +
'<span style="width: 44px; height: 44px; flex: 0 0 44px; border-radius: 9999px; background: ' + PURPLE_SOFT + '; display: flex; align-items: center; justify-content: center">' + ICON + '</span>' +
'<div style="flex: 1 1 240px; min-width: 0">' +
'<h2 id="h-rs" tabindex="-1" style="margin: 0; font-size: 21px; font-weight: 600">เลื่อนวันพัก</h2>' +
'<p style="margin: 4px 0 0; font-size: 14px; line-height: 1.6; color: #5E554C">{{rsLead}}</p>' +
'</div>' +
'<span style="{{rsChipStyle}}">{{rsChip}}</span>' +
'</div>' +
'<template data-sc="if" value="{{rsUsed}}" hint-placeholder-val="{{ false }}">' +
'<div class="fields2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; background: #EDE6D7; border-radius: 14px; padding: 14px 16px">' +
'<div><p style="margin: 0; font-size: 12px; color: #5E554C">วันเข้าพักเดิม</p><p style="margin: 2px 0 0; font-size: 15px; color: #5E554C; text-decoration: line-through">{{rsPrev}}</p></div>' +
'<div><p style="margin: 0; font-size: 12px; color: #5E554C">วันเข้าพักใหม่</p><p style="margin: 2px 0 0; font-size: 15px; font-weight: 600">{{rsNow}}</p></div>' +
'</div>' +
'</template>' +
'<template data-sc="if" value="{{rsReason}}" hint-placeholder-val="{{ false }}"><p style="margin: 0; font-size: 14px; line-height: 1.5; color: #5E554C; background: #EDE6D7; border-radius: 11px; padding: 12px 14px">{{rsReason}}</p></template>' +
'<template data-sc="if" value="{{rsCanStart}}" hint-placeholder-val="{{ true }}">' +
'<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">' +
'<button type="button" onClick="{{rsStart}}" style="background: ' + PURPLE + '; color: #FFFFFF; border: 0; border-radius: 9999px; padding: 12px 22px; font-size: 16px">เลือกวันเข้าพักใหม่</button>' +
'<span style="font-size: 13px; color: #7A6E63">{{rsCurrent}}</span>' +
'</div>' +
'</template>' +
'<template data-sc="if" value="{{rsOpen}}" hint-placeholder-val="{{ false }}">' +
'<div id="rs-cal" style="border-top: 1px solid #E6DDCB; padding-top: 16px">' +
'<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap">' +
'<p role="status" style="margin: 0; font-size: 14px; line-height: 1.5; color: #47413A; flex: 1 1 240px">{{rsHint}}</p>' +
'<div style="display: flex; gap: 8px">' +
'<button type="button" onClick="{{rsPrevM}}" disabled="{{rsNoPrev}}" aria-label="เดือนก่อนหน้า" style="{{rsPrevStyle}}">' + CHEV_L + '</button>' +
'<button type="button" onClick="{{rsNextM}}" disabled="{{rsNoNext}}" aria-label="เดือนถัดไป" style="{{rsNextStyle}}">' + CHEV_R + '</button>' +
'</div>' +
'</div>' +
'<div class="months" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; margin-top: 16px">' +
'<template data-sc="for" list="{{rsMonths}}" as="m" hint-placeholder-count="2">' +
'<div>' +
'<h3 style="margin: 0 0 10px; font-size: 16px; font-weight: 600; text-align: center">{{m.title}}</h3>' +
'<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; text-align: center; font-size: 12px; color: #7A6E63; margin-bottom: 6px"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>' +
'<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px">' +
'<template data-sc="for" list="{{m.cells}}" as="c" hint-placeholder-count="35">' +
'<template data-sc="if" value="{{c.blank}}" hint-placeholder-val="{{ false }}"><span aria-hidden="true"></span></template>' +
'<template data-sc="if" value="{{c.real}}" hint-placeholder-val="{{ true }}"><button type="button" onClick="{{c.pick}}" disabled="{{c.disabled}}" aria-label="{{c.aria}}" aria-pressed="{{c.pressed}}" title="{{c.title}}" style="{{c.style}}"><span>{{c.label}}</span><span style="{{c.subStyle}}">{{c.sub}}</span></button></template>' +
'</template>' +
'</div>' +
'</div>' +
'</template>' +
'</div>' +
'<div style="display: flex; gap: 10px 18px; flex-wrap: wrap; margin-top: 16px; font-size: 13px; color: #47413A">' +
'<span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 9999px; background: #47413A"></span>วันใหม่ที่เลือก</span>' +
'<span style="display: flex; align-items: center; gap: 6px"><span style="width: 16px; height: 16px; border-radius: 4px; background: ' + PURPLE_SOFT + '; border: 2px dashed ' + PURPLE + '; box-sizing: border-box"></span>วันเข้าพักเดิม</span>' +
'<span style="display: flex; align-items: center; gap: 6px"><span style="width: 16px; height: 16px; border-radius: 4px; background: #F3D6DD; border: 1px solid #C88193; box-sizing: border-box"></span>เต็ม</span>' +
'<span style="display: flex; align-items: center; gap: 6px"><span style="width: 16px; height: 16px; border-radius: 4px; background: repeating-linear-gradient(135deg, #F4E7BD 0 4px, #FBF5E4 4px 8px); border: 1px solid #D9B65C; box-sizing: border-box"></span>รอชำระ</span>' +
'</div>' +
'<div class="fields2" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; background: #EDE6D7; border-radius: 14px; padding: 14px 16px">' +
'<div><p style="margin: 0; font-size: 12px; color: #5E554C">วันเข้าพักเดิม</p><p style="margin: 2px 0 0; font-size: 15px">{{rsOld}}</p></div>' +
'<div><p style="margin: 0; font-size: 12px; color: #5E554C">วันเข้าพักใหม่</p><p style="margin: 2px 0 0; font-size: 15px; font-weight: 600">{{rsNew}}</p></div>' +
'<p style="margin: 0; grid-column: 1 / -1; font-size: 13px; color: #5E554C">{{rsPriceNote}}</p>' +
'</div>' +
'<template data-sc="if" value="{{rsConfirming}}" hint-placeholder-val="{{ false }}">' +
'<div role="alert" style="margin-top: 16px; background: ' + PURPLE_SOFT + '; color: ' + PURPLE_INK + '; border: 1px solid #B9AED6; border-radius: 14px; padding: 14px 16px; font-size: 14px; line-height: 1.6">' +
'<strong>เลื่อนวันพักได้ครั้งเดียวเท่านั้น</strong> ยืนยันแล้วจะเปลี่ยนวันผ่านหน้าเว็บอีกไม่ได้ ตรวจสอบวันที่ให้ถูกต้องก่อนกดยืนยัน' +
'</div>' +
'<div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 16px">' +
'<button type="button" onClick="{{rsBack}}" disabled="{{rsBusy}}" style="background: transparent; color: #47413A; border: 1px solid #47413A; border-radius: 9999px; padding: 11px 22px; font-size: 16px">‹ เลือกวันใหม่</button>' +
'<button type="button" onClick="{{rsDo}}" disabled="{{rsBusy}}" style="background: ' + PURPLE + '; color: #FFFFFF; border: 0; border-radius: 9999px; padding: 12px 24px; font-size: 16px; font-weight: 600">{{rsDoLabel}}</button>' +
'</div>' +
'</template>' +
'<template data-sc="if" value="{{rsPicking}}" hint-placeholder-val="{{ true }}">' +
'<div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 16px">' +
'<button type="button" onClick="{{rsCancel}}" style="background: transparent; color: #47413A; border: 1px solid #CFC3AC; border-radius: 9999px; padding: 11px 22px; font-size: 16px">ไม่เลื่อนแล้ว</button>' +
'<button type="button" onClick="{{rsNext}}" disabled="{{rsNextDisabled}}" style="{{rsNextBtn}}">ถัดไป: ยืนยันวันใหม่</button>' +
'</div>' +
'</template>' +
'</div>' +
'</template>' +
'<template data-sc="if" value="{{rsErr}}" hint-placeholder-val="{{ false }}"><p role="alert" style="margin: 0; background: #FFFDF9; border: 1px solid #C88193; border-radius: 11px; padding: 12px 14px; font-size: 14px; line-height: 1.5; color: #9A4E60">{{rsErr}}</p></template>' +
'<template data-sc="if" value="{{rsMsg}}" hint-placeholder-val="{{ false }}"><p role="status" style="margin: 0; background: #E7EFE4; border: 1px solid #9DBB9F; border-radius: 11px; padding: 12px 14px; font-size: 14px; line-height: 1.5; color: #2F5A33">{{rsMsg}}</p></template>' +
'</section>' +
'</template>';

  function patchBookingTpl(tpl) {
    if (tpl.__rs) return;
    tpl.__rs = true;
    var track = deepFind(tpl.content, 'section[aria-labelledby="h-track"]');   // หน้ารออนุมัติ
    var done = deepFind(tpl.content, 'section[aria-labelledby="h-done"]');     // หน้ายืนยันแล้ว
    if (track) after(track, BOOKING_HTML);
    if (done) after(done, BOOKING_HTML);
  }

  function navStyle(dis) {
    return 'width: 36px; height: 36px; border-radius: 9999px; border: 1px solid #DED4C1; background: #F6F3EE; color: ' + (dis ? '#CFC3AC' : '#47413A') + '; display: flex; align-items: center; justify-content: center; padding: 0;';
  }

  /* ---------- ปฏิทินเลือกวันเช็คอินใหม่ (ใช้ทั้งหน้าลูกค้าและแดชบอร์ด) ----------
   * c: { info, nights, pick, red (แดชบอร์ด: วันไม่ว่างเป็นสีแดง), cellH, onPick(d) } */
  function rsCalendar(c) {
    var info = c.info, nights = c.nights, blocked = info.blocked || [];
    var dayState = function (d) {
      var st = null;
      blocked.forEach(function (r) { if (d >= r[0] && d < r[1]) st = (r[2] === 'hold' && st !== 'booked') ? 'hold' : 'booked'; });
      return st;
    };
    var startOk = function (d) {
      if (d < info.minDate || d > info.maxDate || d === info.checkIn) return false;
      for (var k = 0; k < nights; k++) if (dayState(kmDate.add(d, k))) return false;
      return true;
    };
    var pick = c.pick, pickOut = pick ? kmDate.add(pick, nights) : null;
    var month = function (idx) {
      var y = Math.floor(idx / 12), m = (idx % 12) + 1;
      var first = kmDate.monthStart(y, m), cells = [];
      for (var i = 0; i < kmDate.weekday(first); i++) cells.push({ blank: true, real: false });
      var n = kmDate.daysIn(y, m);
      for (var j = 1; j <= n; j++) (function (d) {
        var isEnd = d === pick || d === pickOut;
        var inPick = !!pick && d > pick && d < pickOut;
        var isOld = d >= info.checkIn && d < info.checkOut;
        var st = dayState(d);
        var out = d < info.minDate || d > info.maxDate;
        var ok = startOk(d);
        var css = 'height: ' + (c.cellH || 50) + 'px; width: 100%; border-radius: 10px; font-size: 15px; font-family: inherit; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0; box-sizing: border-box; ';
        var sub = '', subColor = '#7A6E63', why = '';
        if (isEnd) { css += 'border: 0; background: #47413A; color: #F6F3EE; font-weight: 700;'; sub = d === pick ? 'เช็คอิน' : 'เช็คเอาท์'; subColor = '#F6F3EE'; }
        else if (inPick) css += 'border: 0; background: #EFE2B4; color: #47413A;';
        else if (out) { css += 'border: 0; background: transparent; color: #CFC3AC;'; why = ' เลือกไม่ได้'; }
        else if (st === 'booked') {
          css += c.red ? 'border: 1px solid #C0392B; background: #F6CDC9; color: #8A1F1A; font-weight: 600;' : 'border: 1px solid #C88193; background: #F3D6DD; color: #7E3E50; font-weight: 600;';
          sub = c.red ? 'ไม่ว่าง' : 'เต็ม'; subColor = c.red ? '#8A1F1A' : '#7E3E50'; why = ' ไม่ว่าง';
        }
        else if (st === 'hold') {
          css += c.red ? 'border: 1px solid #C0392B; background: repeating-linear-gradient(135deg, #F6CDC9 0 4px, #FBE6E3 4px 8px); color: #8A1F1A; font-weight: 600;' : 'border: 1px solid #D9B65C; background: repeating-linear-gradient(135deg, #F4E7BD 0 4px, #FBF5E4 4px 8px); color: #6B5420; font-weight: 600;';
          sub = c.red ? 'กำลังจอง' : 'รอชำระ'; subColor = c.red ? '#8A1F1A' : '#6B5420'; why = ' มีลูกค้ากำลังจอง';
        }
        else if (isOld) { css += 'border: 2px dashed ' + PURPLE + '; background: ' + PURPLE_SOFT + '; color: ' + PURPLE_INK + '; font-weight: 600;'; sub = 'วันเดิม'; subColor = PURPLE_INK; }
        else if (!ok) { css += 'border: 1px solid transparent; background: transparent; color: #B3A897;'; why = ' ว่าง แต่พักต่อเนื่อง ' + nights + ' คืนไม่ได้'; }
        else css += 'border: 1px solid ' + (c.red ? '#DED4C1' : 'transparent') + '; background: #FFFDF9; color: #47413A;';
        cells.push({ blank: false, real: true, label: String(Number(d.slice(8, 10))), disabled: !ok, pressed: d === pick ? 'true' : 'false',
          style: css, sub: sub, title: why ? kmDate.short(d) + why : '',
          subStyle: 'font-size: 10px; line-height: 1; font-weight: 600; color: ' + subColor + ';' + (sub ? '' : ' display: none;'),
          aria: kmDate.short(d) + (isOld ? ' วันเข้าพักเดิม' : '') + why,
          pick: function () { c.onPick(d); } });
      })(kmDate.add(first, j - 1));
      return { title: kmDate.monthTitle(y, m), cells: cells };
    };
    var idxOf = function (d) { var p = d.split('-').map(Number); return p[0] * 12 + p[1] - 1; };
    return { month: month, idxOf: idxOf, minIdx: idxOf(info.minDate), maxIdx: idxOf(info.maxDate), pickOut: pickOut };
  }

  function bookingVals(inst) {
    var s = inst.state, sv = s.saved;
    var off = { rsShow: false };
    if (!sv || !sv.code || !sv.phone || !(s.step === 4 || s.step === 5) || s.bkStatus === 'cancelled') return off;

    // โหลดสิทธิ์และวันไม่ว่างของห้องนี้ (โหลดใหม่เมื่อวันเข้าพักหรือสถานะเปลี่ยน)
    var key = sv.code + '|' + sv.ci + '|' + s.bkStatus;
    if (s.rsKey !== key && inst._rsReq !== key) {
      inst._rsReq = key;
      kmApi('publicRescheduleInfo', sv.code, sv.phone).then(function (info) {
        if (inst._rsReq === key) inst.setState({ rsKey: key, rsInfo: info, rsOff: false });
      }, function (e) {
        if (inst._rsReq !== key) return;
        var notInstalled = /ไม่รู้จักคำสั่ง/.test(String(e && e.message));
        inst.setState({ rsKey: key, rsOff: notInstalled || !inst.state.rsInfo });
      });
    }
    var info = s.rsInfo;
    if (s.rsOff || !info || info.code !== String(sv.code).toUpperCase() && info.code !== sv.code) return off;

    var nights = Number(info.nights) || 1;
    var used = !!info.used;
    var can = !used && !!info.can;
    var open = can && !!s.rsOpen;
    var pick = open ? s.rsPick : null;
    var cal = rsCalendar({ info: info, nights: nights, pick: pick, red: false, cellH: 50,
      onPick: function (d) { inst.setState({ rsPick: d, rsConfirm: false, rsErr: '', rsMsg: '' }); } });
    var pickOut = cal.pickOut;
    var range = function (a, b) { return kmDate.short(a) + ' – ' + kmDate.short(b); };

    // มาจากปุ่ม "เลื่อนวันพัก" ในหน้าแรก (?rs=1): เปิดปฏิทินให้เลย 1 ครั้ง
    if (inst._rsAuto === undefined) inst._rsAuto = /(^|[?&])rs=1(&|$)/.test(String(window.__kmQuery || location.search || '').replace(/^\?/, ''));
    if (inst._rsAuto && can && !s.rsOpen) {
      inst._rsAuto = false;
      setTimeout(function () {
        inst.setState({ rsOpen: true, rsPick: null, rsConfirm: false }, function () {
          var c = document.getElementById('h-rs'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }, 0);
    }

    // ปฏิทิน 2 เดือน
    var minIdx = cal.minIdx, maxIdx = cal.maxIdx;
    var vIdx = s.rsView == null ? Math.max(minIdx, cal.idxOf(info.checkIn)) : s.rsView;
    vIdx = Math.max(minIdx, Math.min(vIdx, Math.max(minIdx, maxIdx - 1)));
    var months = open ? [cal.month(vIdx)].concat(vIdx + 1 <= maxIdx ? [cal.month(vIdx + 1)] : []) : [];
    var noPrev = vIdx <= minIdx, noNext = vIdx + 1 >= maxIdx;

    var priceNote = info.keepPrice
      ? 'ยอดชำระเท่าเดิม' + (info.totalPrice ? ' ฿' + kmMoney(info.totalPrice) : '') + ' ไม่มีค่าธรรมเนียมเลื่อนวัน'
      : 'ราคาจะคิดใหม่ตามวันที่เลือก ถ้ามีส่วนต่าง ที่พักจะติดต่อกลับ';
    var lead = used
      ? 'การจองนี้เลื่อนวันพักไปแล้ว ใช้สิทธิ์ครบ 1 ครั้ง หากต้องการเปลี่ยนอีก กรุณาติดต่อที่พัก'
      : can
        ? 'เปลี่ยนวันเข้าพักได้ 1 ครั้ง ห้องเดิม จำนวนคืนเท่าเดิม (' + nights + ' คืน) ขอเลื่อนได้ถึง ' + (info.minDaysBefore || 1) + ' วันก่อนวันเช็คอิน'
        : 'ตอนนี้เลื่อนวันพักผ่านหน้าเว็บไม่ได้';
    var chip = used ? 'ใช้สิทธิ์แล้ว 1/1' : can ? 'เลื่อนได้ 1 ครั้ง' : 'เลื่อนไม่ได้';
    var chipStyle = 'flex: 0 0 auto; border-radius: 9999px; padding: 5px 12px; font-size: 13px; font-weight: 600; white-space: nowrap; ' +
      (used ? 'background: #E6DDCB; color: #47413A;' : can ? 'background: ' + PURPLE_SOFT + '; color: ' + PURPLE_INK + ';' : 'background: #EDE6D7; color: #5E554C;');

    var close = function () { inst.setState({ rsOpen: false, rsPick: null, rsConfirm: false, rsErr: '' }); };
    var submit = function () {
      if (inst.state.rsBusy || !pick) return;
      inst.setState({ rsBusy: true, rsErr: '', rsMsg: '' });
      kmApi('publicRescheduleBooking', sv.code, sv.phone, pick).then(function (r) {
        var cur = inst.state.saved || sv;
        var saved = Object.assign({}, cur, { ci: r.checkIn, co: r.checkOut, nights: r.nights, total: r.totalPrice });
        if (typeof inst.saveLocal === 'function') inst.saveLocal(saved);
        var nk = saved.code + '|' + saved.ci + '|' + inst.state.bkStatus;
        inst._rsReq = nk;
        inst.setState({ saved: saved, rsBusy: false, rsOpen: false, rsConfirm: false, rsPick: null, rsView: null,
          rsInfo: r.info, rsKey: nk, rsOff: false,
          rsMsg: r.message + (saved.email ? ' · ส่งอีเมลยืนยันไปที่ ' + saved.email + ' แล้ว' : '') },
          function () { var h = document.getElementById('h-rs'); if (h) { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); h.focus({ preventScroll: true }); } });
        // หน้ายืนยันแล้ว: โหลดใบเสร็จฉบับวันใหม่
        if (inst.state.step === 5 && typeof inst.checkStatus === 'function') setTimeout(function () { inst.checkStatus(true); }, 0);
      }, function (e) {
        var msg = String((e && e.message) || e).replace(/^BUSY:\s*/, '');
        // ห้องเพิ่งไม่ว่าง: โหลดวันไม่ว่างใหม่ ให้เลือกวันอื่น
        var stale = /ไม่ว่าง|กำลังจอง/.test(msg);
        if (stale) inst._rsReq = '';
        inst.setState({ rsBusy: false, rsConfirm: false, rsErr: msg, rsPick: stale ? null : inst.state.rsPick, rsKey: stale ? '' : inst.state.rsKey });
      });
    };

    return {
      rsShow: true, rsLead: lead, rsChip: chip, rsChipStyle: chipStyle,
      rsUsed: used,
      rsPrev: info.prevCheckIn ? range(info.prevCheckIn, info.prevCheckOut) : '—',
      rsNow: range(info.checkIn, info.checkOut) + ' (' + nights + ' คืน)',
      rsReason: !used && !can ? info.reason : '',
      rsCanStart: can && !open,
      rsCurrent: 'ตอนนี้: ' + range(info.checkIn, info.checkOut),
      rsStart: function () {
        inst.setState({ rsOpen: true, rsPick: null, rsConfirm: false, rsErr: '', rsMsg: '' }, function () {
          var c = document.getElementById('rs-cal'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      },
      rsOpen: open,
      rsHint: pick ? 'วันใหม่: ' + range(pick, pickOut) + ' (' + nights + ' คืน)' : 'แตะวันเช็คอินใหม่ ระบบเลือกวันเช็คเอาท์ให้ ' + nights + ' คืนเท่าเดิม',
      rsMonths: months, rsNoPrev: noPrev, rsNoNext: noNext, rsPrevStyle: navStyle(noPrev), rsNextStyle: navStyle(noNext),
      rsPrevM: function () { inst.setState({ rsView: vIdx - 1 }); },
      rsNextM: function () { inst.setState({ rsView: vIdx + 1 }); },
      rsOld: range(info.checkIn, info.checkOut),
      rsNew: pick ? range(pick, pickOut) : 'ยังไม่ได้เลือก',
      rsPriceNote: priceNote,
      rsPicking: open && !(s.rsConfirm && pick),
      rsConfirming: open && !!(s.rsConfirm && pick),
      rsNextDisabled: !pick,
      rsNextBtn: 'border: 0; border-radius: 9999px; padding: 12px 24px; font-size: 16px; color: #FFFFFF; background: ' + (pick ? PURPLE : '#CFC3AC') + ';',
      rsNext: function () { if (pick) inst.setState({ rsConfirm: true, rsErr: '' }); },
      rsBack: function () { inst.setState({ rsConfirm: false }); },
      rsCancel: close,
      rsBusy: !!s.rsBusy, rsDoLabel: s.rsBusy ? 'กำลังเลื่อนวันพัก…' : 'ยืนยัน เลื่อนเป็น ' + (pick ? kmDate.dm(pick) : ''),
      rsDo: submit,
      rsErr: s.rsErr || '', rsMsg: s.rsMsg || ''
    };
  }

  function patchBookingClass(C) {
    var P = C.prototype;
    if (P.__rs) return;
    P.__rs = true;
    var rv = P.renderVals;
    P.renderVals = function () {
      var v = rv.call(this);
      var x = bookingVals(this);
      for (var k in x) v[k] = x[k];
      return v;
    };
  }

  /* =========================================================
   * แดชบอร์ดแอดมิน
   * ========================================================= */
  var ADMIN_TAG_HTML =
'<template data-sc="if" value="{{b.rsTag}}" hint-placeholder-val="{{ false }}"><span style="display: block; margin-top: 5px; font-size: 11px; font-weight: 600; color: ' + PURPLE_INK + '; white-space: nowrap">↻ {{b.rsTag}}</span></template>';

  var ADMIN_DLG_HTML =
'<template data-sc="if" value="{{rsDlgOpen}}" hint-placeholder-val="{{ false }}">' +
'<div id="km-rs-back" onClick="{{rsDlgBack}}" style="position: fixed; inset: 0; z-index: 81; background: rgba(58,53,47,.55); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box">' +
'<div role="dialog" aria-modal="true" aria-labelledby="km-rs-h" class="km-dlg" style="width: 100%; max-width: 460px; max-height: calc(100vh - 32px); overflow-y: auto; background: #FFFDF9; color: #47413A; border-radius: 18px; box-shadow: 0 20px 48px rgba(58,53,47,.35); padding: 22px; box-sizing: border-box">' +
'<p style="margin: 0; font-size: 12px; color: #7A6E63">{{rsD.sub}}</p>' +
'<h2 id="km-rs-h" style="margin: 2px 0 0; font-size: 19px; font-weight: 600; line-height: 1.4">{{rsD.title}}</h2>' +
'<p style="margin: 8px 0 0; font-size: 14px; color: #5E554C">{{rsD.old}}</p>' +
'<template data-sc="if" value="{{rsD.loading}}" hint-placeholder-val="{{ false }}"><p role="status" style="margin: 12px 0 0; font-size: 14px; color: #7A6E63">กำลังตรวจสอบสิทธิ์และห้องว่าง…</p></template>' +
'<template data-sc="if" value="{{rsD.reason}}" hint-placeholder-val="{{ false }}"><p style="margin: 12px 0 0; font-size: 14px; line-height: 1.5; background: #FBE3DF; color: #8A2F2A; border-radius: 10px; padding: 9px 12px">{{rsD.reason}}</p></template>' +
'<template data-sc="if" value="{{rsD.canPick}}" hint-placeholder-val="{{ true }}">' +
'<p style="margin: 14px 0 0; font-size: 14px; font-weight: 600">แตะวันเช็คอินใหม่ (พัก {{rsD.nights}} คืนเท่าเดิม)</p>' +
'<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px">' +
'<button type="button" onClick="{{rsDPrev}}" disabled="{{rsD.noPrev}}" aria-label="เดือนก่อนหน้า" style="{{rsD.prevStyle}}">' + CHEV_L + '</button>' +
'<h3 style="margin: 0; font-size: 16px; font-weight: 600">{{rsD.monthTitle}}</h3>' +
'<button type="button" onClick="{{rsDNext}}" disabled="{{rsD.noNext}}" aria-label="เดือนถัดไป" style="{{rsD.nextStyle}}">' + CHEV_R + '</button>' +
'</div>' +
'<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; text-align: center; font-size: 12px; color: #7A6E63; margin: 10px 0 6px"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>' +
'<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px">' +
'<template data-sc="for" list="{{rsD.cells}}" as="c" hint-placeholder-count="35">' +
'<template data-sc="if" value="{{c.blank}}" hint-placeholder-val="{{ false }}"><span aria-hidden="true"></span></template>' +
'<template data-sc="if" value="{{c.real}}" hint-placeholder-val="{{ true }}"><button type="button" onClick="{{c.pick}}" disabled="{{c.disabled}}" aria-label="{{c.aria}}" aria-pressed="{{c.pressed}}" title="{{c.title}}" style="{{c.style}}"><span>{{c.label}}</span><span style="{{c.subStyle}}">{{c.sub}}</span></button></template>' +
'</template>' +
'</div>' +
'<div style="display: flex; gap: 8px 14px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; color: #47413A">' +
'<span style="display: flex; align-items: center; gap: 5px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #FFFDF9; border: 1px solid #DED4C1; box-sizing: border-box"></span>ว่าง</span>' +
'<span style="display: flex; align-items: center; gap: 5px"><span style="width: 14px; height: 14px; border-radius: 4px; background: #F6CDC9; border: 1px solid #C0392B; box-sizing: border-box"></span>ไม่ว่าง</span>' +
'<span style="display: flex; align-items: center; gap: 5px"><span style="width: 14px; height: 14px; border-radius: 4px; background: repeating-linear-gradient(135deg, #F6CDC9 0 3px, #FBE6E3 3px 6px); border: 1px solid #C0392B; box-sizing: border-box"></span>มีลูกค้ากำลังจอง</span>' +
'<span style="display: flex; align-items: center; gap: 5px"><span style="width: 14px; height: 14px; border-radius: 4px; background: ' + PURPLE_SOFT + '; border: 2px dashed ' + PURPLE + '; box-sizing: border-box"></span>วันเดิม</span>' +
'<span style="display: flex; align-items: center; gap: 5px"><span style="width: 14px; height: 14px; border-radius: 9999px; background: #47413A"></span>วันใหม่</span>' +
'</div>' +
'<template data-sc="if" value="{{rsD.avail}}" hint-placeholder-val="{{ false }}"><p role="status" style="{{rsD.availStyle}}">{{rsD.avail}}</p></template>' +
'<p style="margin: 10px 0 0; font-size: 13px; color: #5E554C">{{rsD.price}}</p>' +
'<p style="margin: 12px 0 0; font-size: 13px; line-height: 1.5; background: ' + PURPLE_SOFT + '; color: ' + PURPLE_INK + '; border-radius: 10px; padding: 9px 12px">เลื่อนได้ครั้งเดียวต่อการจอง (นับรวมที่ลูกค้าเลื่อนเองทางหน้าเว็บ) บันทึกแล้วจะเลื่อนอีกไม่ได้ ระบบแจ้ง LINE และส่งอีเมลถึงลูกค้าให้</p>' +
'</template>' +
'<template data-sc="if" value="{{rsD.err}}" hint-placeholder-val="{{ false }}"><p role="alert" style="margin: 12px 0 0; font-size: 14px; line-height: 1.5; color: #9A4E60">{{rsD.err}}</p></template>' +
'<div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 18px">' +
'<button type="button" onClick="{{rsDlgCancel}}" style="min-height: 44px; padding: 0 18px; border: 1px solid #DED4C1; border-radius: 9999px; background: #F6F3EE; color: #47413A; font-size: 15px">{{rsD.cancelLabel}}</button>' +
'<template data-sc="if" value="{{rsD.canPick}}" hint-placeholder-val="{{ true }}"><button type="button" onClick="{{rsDlgOk}}" disabled="{{rsD.okDisabled}}" style="{{rsD.okStyle}}">{{rsD.okLabel}}</button></template>' +
'</div>' +
'</div>' +
'</div>' +
'</template>';

  var adminInst = null;

  function patchAdminTpl(tpl) {
    if (tpl.__rs) return;
    tpl.__rs = true;
    var badge = deepFind(tpl.content, 'span[style="{{b.badge}}"]');
    if (badge) after(badge, ADMIN_TAG_HTML);
    tpl.content.appendChild(frag(ADMIN_DLG_HTML));
  }

  function dlgPatch(inst, p) {
    if (!inst.state.rsDlg) return;
    inst.setState({ rsDlg: Object.assign({}, inst.state.rsDlg, p) });
  }
  function closeDlg(inst) {
    var back = inst._rsFocus;
    inst.setState({ rsDlg: null }, function () { if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); });
  }
  function openDlg(inst, b, roomLabel) {
    inst._rsFocus = document.activeElement;
    inst.setState({ rsDlg: { id: b.id, code: b.code, name: b.guestName, room: roomLabel, ci: b.checkIn, co: b.checkOut,
      nights: Number(b.nights) || kmDate.diff(b.checkIn, b.checkOut), date: '', view: null, info: null, loading: true, err: '', busy: false } },
      function () { var c = document.querySelector('#km-rs-back button'); if (c) c.focus(); });
    kmApi('adminRescheduleInfo', kmToken.get(), b.id).then(function (info) {
      dlgPatch(inst, { info: info, loading: false });
      setTimeout(function () { var i = document.querySelector('#km-rs-back [aria-pressed]:not([disabled])'); if (i) i.focus(); }, 0);
    }, function (e) {
      if (typeof inst.fail === 'function' && inst.fail(e)) return;
      dlgPatch(inst, { loading: false, err: String((e && e.message) || e) });
    });
  }

  function adminVals(inst, v) {
    var s = inst.state;
    var map = s.rsMap || {};
    var bookings = s.bookings || [];
    var today = (s.dash && s.dash.today) || (typeof inst.today === 'function' ? inst.today() : new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
    var byCode = {}, byId = {};
    bookings.forEach(function (b) { byCode[b.code] = b; byId[b.id] = b; });
    var actStyle = 'border-radius: 9999px; padding: 6px 12px; font-size: 13px; white-space: nowrap; border: 1px solid ' + PURPLE + '; background: transparent; color: ' + PURPLE + ';';

    // ตาราง: ป้ายเลื่อนแล้ว / ปุ่มเลื่อนวัน (ก่อนปุ่มยกเลิก)
    (v.rows || []).forEach(function (r) {
      var b = byCode[r.code];
      if (!b) return;
      var rs = map[b.id];
      if (rs) { r.rsTag = 'เลื่อนวันแล้ว · เดิม ' + kmDate.dm(rs.prevCheckIn) + '–' + kmDate.dm(rs.prevCheckOut); return; }
      r.rsTag = '';
      if (!s.rsLoaded || RS_STATUSES.indexOf(b.status) < 0 || b.checkIn < today || !Array.isArray(r.actions)) return;
      var i = -1;
      r.actions.forEach(function (a, k) { if (a.label === 'ยกเลิก') i = k; });
      if (i < 0) i = r.actions.length;
      r.actions.splice(i, 0, { label: 'เลื่อนวัน', style: actStyle, busy: s.acting === b.id || !!s.rsDlg,
        run: function () { openDlg(inst, b, r.room); } });
    });

    // กล่องรายละเอียดในปฏิทิน
    if (v.pop && s.pop && byId[s.pop.id] && map[s.pop.id] && Array.isArray(v.pop.rows)) {
      var rp = map[s.pop.id];
      v.pop.rows.push({ l: 'เลื่อนวัน', v: 'จาก ' + kmDate.short(rp.prevCheckIn) + ' – ' + kmDate.short(rp.prevCheckOut) + (rp.by ? ' (' + rp.by + ')' : '') });
    }

    // การแจ้งเตือน: เหตุการณ์ล่าสุดของการจองที่เพิ่งเลื่อนวัน แสดงเป็น "เลื่อนวันพัก"
    bookings.forEach(function (b) {
      var rs = map[b.id];
      if (!rs || rs.at !== b.updatedAt) return;
      var span = kmDate.dm(b.checkIn) + '–' + kmDate.dm(b.checkOut);
      (v.notes || []).forEach(function (n) {
        if (typeof n.text !== 'string' || n.text.indexOf(b.guestName) < 0 || n.text.indexOf(span) < 0 || n.kind === 'เลื่อนวันพัก') return;
        n.text = b.guestName + ' เลื่อนวันพักจาก ' + kmDate.dm(rs.prevCheckIn) + '–' + kmDate.dm(rs.prevCheckOut) + ' เป็น ' + span + (rs.by ? ' · ' + rs.by : '');
        n.kind = 'เลื่อนวันพัก';
        n.openLabel = n.text + ' · ไปที่ปฏิทินวันที่ ' + kmDate.dm(b.checkIn);
      });
    });

    // กล่องเลื่อนวันพัก
    var d = s.rsDlg;
    var out = { rsDlgOpen: !!d, rsD: {} };
    if (d) {
      var info = d.info;
      var canPick = !!(info && info.can);
      var date = d.date;
      var rd = { cells: [] };
      if (canPick) {
        var cal = rsCalendar({ info: info, nights: d.nights, pick: date, red: true, cellH: 44,
          onPick: function (x) { dlgPatch(inst, { date: x, err: '' }); } });
        var vIdx = d.view == null ? Math.max(cal.minIdx, cal.idxOf(info.checkIn)) : d.view;
        vIdx = Math.max(cal.minIdx, Math.min(vIdx, cal.maxIdx));
        var mo = cal.month(vIdx);
        rd = { cells: mo.cells, monthTitle: mo.title, view: vIdx,
          noPrev: vIdx <= cal.minIdx, noNext: vIdx >= cal.maxIdx,
          prevStyle: navStyle(vIdx <= cal.minIdx), nextStyle: navStyle(vIdx >= cal.maxIdx) };
      }
      var avail = canPick
        ? (date ? 'วันใหม่: ' + kmDate.short(date) + ' – ' + kmDate.short(kmDate.add(date, d.nights)) + ' (' + d.nights + ' คืน) · ห้องว่าง'
                : 'ยังไม่ได้เลือกวัน วันสีแดงคือห้องไม่ว่าง')
        : '';
      out.rsD = {
        sub: d.code + ' · ' + (d.room || ''),
        title: 'เลื่อนวันพัก ' + d.name,
        old: 'วันเดิม ' + kmDate.short(d.ci) + ' – ' + kmDate.short(d.co) + ' (' + d.nights + ' คืน)',
        nights: String(d.nights),
        loading: !!d.loading, reason: info && !info.can ? info.reason : '', canPick: canPick,
        cells: rd.cells, monthTitle: rd.monthTitle || '', noPrev: !!rd.noPrev, noNext: !!rd.noNext,
        prevStyle: rd.prevStyle || '', nextStyle: rd.nextStyle || '',
        avail: avail,
        availStyle: 'margin: 12px 0 0; font-size: 14px; font-weight: 600; border-radius: 10px; padding: 9px 12px; ' + (date ? 'background: #DCE8DD; color: #2F5A33;' : 'background: #EDE6D7; color: #5E554C;'),
        price: info ? (info.keepPrice ? 'ยอดเดิม ฿' + kmMoney(info.totalPrice) + ' (ไม่คิดราคาใหม่)' : 'ระบบจะคิดราคาใหม่ตามวันใหม่ และบันทึกส่วนต่างในหมายเหตุ') : '',
        err: d.err || '',
        cancelLabel: canPick ? 'ยกเลิก' : 'ปิด',
        okDisabled: !canPick || !date || !!d.busy,
        okLabel: d.busy ? 'กำลังบันทึก…' : 'ยืนยันเลื่อนวัน',
        okStyle: 'min-height: 44px; padding: 0 20px; border: 0; border-radius: 9999px; font-size: 15px; font-weight: 600; color: #FFFFFF; background: ' + (!canPick || !date ? '#B3A897' : PURPLE) + ';'
      };
      out.rsDPrev = function () { if (!rd.noPrev) dlgPatch(inst, { view: rd.view - 1 }); };
      out.rsDNext = function () { if (!rd.noNext) dlgPatch(inst, { view: rd.view + 1 }); };
    }
    out.rsDlgCancel = function () { closeDlg(inst); };
    out.rsDlgBack = function (e) { if (e.target === e.currentTarget || (e.target && e.target.id === 'km-rs-back')) closeDlg(inst); };
    out.rsDlgOk = function () {
      var cur = inst.state.rsDlg;
      if (!cur || cur.busy || !cur.date) return;
      dlgPatch(inst, { busy: true, err: '' });
      kmApi('adminRescheduleBooking', kmToken.get(), cur.id, cur.date).then(function (msg) {
        closeDlg(inst);
        if (typeof inst.say === 'function') inst.say(msg);
        inst.load(true);
      }, function (e) {
        if (typeof inst.fail === 'function' && inst.fail(e)) return;
        dlgPatch(inst, { busy: false, err: String((e && e.message) || e).replace(/^BUSY:\s*/, '') });
        if (/ไม่ว่าง|กำลังจอง/.test(String(e && e.message))) {
          kmApi('adminRescheduleInfo', kmToken.get(), cur.id).then(function (info) { dlgPatch(inst, { info: info, date: '' }); }, function () {});
        }
      });
    };
    return out;
  }

  function patchAdminClass(C) {
    var P = C.prototype;
    if (P.__rs) return;
    P.__rs = true;
    var rv = P.renderVals;
    P.renderVals = function () {
      adminInst = this;
      var v = rv.call(this);
      var x = adminVals(this, v);
      for (var k in x) v[k] = x[k];
      return v;
    };
    var load = P.load;
    if (typeof load === 'function') {
      P.load = function () {
        var self = this;
        var p = load.apply(this, arguments);
        var t = window.kmToken && kmToken.get();
        if (t) kmApi('listReschedules', t).then(function (m) { self.setState({ rsMap: m || {}, rsLoaded: true }); },
          function () { self.setState({ rsLoaded: false }); });
        return p;
      };
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && adminInst && adminInst.state && adminInst.state.rsDlg) closeDlg(adminInst);
  });

  /* =========================================================
   * หน้าแรก: ปุ่ม "เลื่อนวันพัก" + กล่องค้นหาการจองด้วยรหัสและเบอร์โทร
   * ========================================================= */
  var HOME_BTN_STYLE = 'background: transparent; color: ' + PURPLE + '; border: 1px solid ' + PURPLE + '; border-radius: 9999px; padding: 5px 14px; font-size: 14px; font-family: inherit; cursor: pointer; white-space: nowrap';
  var HOME_NAV_HTML = '<button type="button" onClick="{{hmOpen}}" style="' + HOME_BTN_STYLE + '">เลื่อนวันพัก</button>';
  var HOME_HERO_HTML =
'<p style="margin: 20px 0 0; font-size: 15px; line-height: 1.6; color: #5E554C; text-align: center">จองไว้แล้วแต่อยากเปลี่ยนวัน? ' +
'<button type="button" onClick="{{hmOpen}}" style="background: transparent; border: 0; padding: 0; font: inherit; font-weight: 600; color: ' + PURPLE + '; text-decoration: underline; text-underline-offset: 3px; cursor: pointer">เลื่อนวันพักได้ 1 ครั้ง ›</button></p>';
  var HOME_FOOT_HTML = '<button type="button" onClick="{{hmOpen}}" style="background: transparent; border: 0; padding: 0; font: inherit; color: #5E554C; text-align: left; cursor: pointer">เลื่อนวันพัก</button>';
  var FIELD = 'height: 48px; border: 1px solid #CFC3AC; border-radius: 11px; padding: 0 14px; font-size: 17px; font-weight: 400; font-family: inherit; color: #47413A; background: #FFFDF9; box-sizing: border-box; width: 100%';
  var HOME_DLG_HTML =
'<template data-sc="if" value="{{hmIsOpen}}" hint-placeholder-val="{{ false }}">' +
'<div id="km-hm-back" onClick="{{hmBack}}" style="position: fixed; inset: 0; z-index: 81; background: rgba(58,53,47,.55); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box">' +
'<div role="dialog" aria-modal="true" aria-labelledby="km-hm-h" style="width: 100%; max-width: 440px; max-height: calc(100vh - 32px); overflow-y: auto; background: #FFFDF9; color: #47413A; border-radius: 18px; box-shadow: 0 20px 48px rgba(58,53,47,.35); padding: 24px; box-sizing: border-box; text-align: left">' +
'<div style="display: flex; align-items: center; gap: 12px">' +
'<span style="width: 44px; height: 44px; flex: 0 0 44px; border-radius: 9999px; background: ' + PURPLE_SOFT + '; display: flex; align-items: center; justify-content: center">' + ICON + '</span>' +
'<h2 id="km-hm-h" style="margin: 0; font-size: 21px; font-weight: 600">เลื่อนวันพัก</h2>' +
'</div>' +
'<p style="margin: 10px 0 0; font-size: 14px; line-height: 1.6; color: #5E554C">กรอกรหัสการจองและเบอร์โทรที่ใช้ตอนจอง เลื่อนวันได้ 1 ครั้งต่อการจอง ห้องเดิม จำนวนคืนเท่าเดิม</p>' +
'<form onSubmit="{{hmFind}}" style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px">' +
'<label style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600">รหัสการจอง' +
'<input id="km-hm-code" type="text" value="{{hm.code}}" onInput="{{hmSetCode}}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="เช่น KM261103ABCD" style="' + FIELD + '; text-transform: uppercase; letter-spacing: 0.5px"></label>' +
'<label style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600">เบอร์โทรศัพท์ที่ใช้จอง' +
'<input type="tel" value="{{hm.phone}}" onInput="{{hmSetPhone}}" autocomplete="tel" placeholder="08X-XXX-XXXX" style="' + FIELD + '"></label>' +
'<template data-sc="if" value="{{hm.err}}" hint-placeholder-val="{{ false }}"><p role="alert" style="margin: 0; font-size: 14px; line-height: 1.5; color: #9A4E60; background: #FFFDF9; border: 1px solid #C88193; border-radius: 11px; padding: 10px 12px">{{hm.err}}</p></template>' +
'<template data-sc="if" value="{{hm.showFind}}" hint-placeholder-val="{{ true }}">' +
'<div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap">' +
'<button type="button" onClick="{{hmClose}}" style="min-height: 44px; padding: 0 18px; border: 1px solid #DED4C1; border-radius: 9999px; background: #F6F3EE; color: #47413A; font-size: 15px; font-family: inherit">ปิด</button>' +
'<button type="submit" disabled="{{hm.busy}}" style="min-height: 44px; padding: 0 22px; border: 0; border-radius: 9999px; background: ' + PURPLE + '; color: #FFFFFF; font-size: 15px; font-weight: 600; font-family: inherit">{{hm.findLabel}}</button>' +
'</div>' +
'</template>' +
'</form>' +
'<template data-sc="if" value="{{hm.found}}" hint-placeholder-val="{{ false }}">' +
'<div role="status" style="margin-top: 16px; background: #EDE6D7; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px">' +
'<p style="margin: 0; font-size: 12px; color: #5E554C">{{hm.codeLine}}</p>' +
'<p style="margin: 0; font-size: 16px; font-weight: 600">{{hm.room}}</p>' +
'<p style="margin: 0; font-size: 14px">{{hm.dates}}</p>' +
'</div>' +
'<template data-sc="if" value="{{hm.note}}" hint-placeholder-val="{{ false }}"><p style="margin: 12px 0 0; font-size: 14px; line-height: 1.5; color: #5E554C">{{hm.note}}</p></template>' +
'<div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px">' +
'<button type="button" onClick="{{hmAgain}}" style="min-height: 44px; padding: 0 18px; border: 1px solid #DED4C1; border-radius: 9999px; background: #F6F3EE; color: #47413A; font-size: 15px; font-family: inherit">ค้นหาการจองอื่น</button>' +
'<template data-sc="if" value="{{hm.canGo}}" hint-placeholder-val="{{ true }}"><button type="button" onClick="{{hmGo}}" style="min-height: 44px; padding: 0 22px; border: 0; border-radius: 9999px; background: ' + PURPLE + '; color: #FFFFFF; font-size: 15px; font-weight: 600; font-family: inherit">เลือกวันเข้าพักใหม่ ›</button></template>' +
'<template data-sc="if" value="{{hm.canView}}" hint-placeholder-val="{{ false }}"><button type="button" onClick="{{hmView}}" style="min-height: 44px; padding: 0 22px; border: 0; border-radius: 9999px; background: #47413A; color: #F6F3EE; font-size: 15px; font-family: inherit">ดูการจองนี้ ›</button></template>' +
'</div>' +
'</template>' +
'</div>' +
'</div>' +
'</template>';

  var homeInst = null;

  function patchHomeTpl(tpl) {
    if (tpl.__rs) return;
    tpl.__rs = true;
    var c = tpl.content;
    var navPill = deepFind(c, 'a.pill[href="booking.html"]');          // ปุ่ม "จองเลย" ในแถบเมนูย่อย
    if (navPill) navPill.parentNode.insertBefore(frag(HOME_NAV_HTML), navPill);
    var finder = deepFind(c, 'form.finder');                            // กล่องค้นหาห้องว่างในส่วนหัว
    if (finder) after(finder, HOME_HERO_HTML);
    var links = c.querySelectorAll('a[href^="booking.html"]');          // ลิงก์ "ยกเลิกการจอง" ในส่วนท้าย
    for (var i = 0; i < links.length; i++) {
      if (/ยกเลิกการจอง/.test(links[i].textContent)) { after(links[i], HOME_FOOT_HTML); break; }
    }
    c.appendChild(frag(HOME_DLG_HTML));
  }

  function savedBooking() { try { return JSON.parse(localStorage.getItem('km_booking') || 'null'); } catch (e) { return null; } }

  function homeVals(inst) {
    var s = inst.state, h = s.hm || null;
    var set = function (p) { inst.setState({ hm: Object.assign({}, inst.state.hm, p) }); };
    var open = function () {
      var sv = savedBooking() || {};
      inst._rsFocus = document.activeElement;
      inst.setState({ hm: { code: sv.code || '', phone: sv.phone || '', err: '', busy: false, info: null } },
        function () { var i = document.getElementById('km-hm-code'); if (i) i.focus(); });
    };
    var close = function () {
      var back = inst._rsFocus;
      inst.setState({ hm: null }, function () { if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); });
    };
    var go = function (rs) {
      var info = h.info, cur = savedBooking();
      var base = cur && String(cur.code).toUpperCase() === info.code ? cur : {
        code: info.code, phone: h.phone.trim(), first: info.firstName || '', email: info.email || '', pets: info.pets || '',
        guests: String(info.guests || ''), payName: '', slipName: ''
      };
      var saved = Object.assign({}, base, { code: info.code, phone: h.phone.trim(), roomNo: info.roomNo, roomName: info.roomName,
        ci: info.checkIn, co: info.checkOut, nights: info.nights, total: info.totalPrice,
        status: info.status === 'confirmed' ? 'confirmed' : 'pending' });
      try { localStorage.setItem('km_booking', JSON.stringify(saved)); } catch (e) {}
      inst.setState({ hm: null });
      if (typeof window.kmGo === 'function') window.kmGo('booking', rs ? 'rs=1' : '');
      else location.href = 'booking.html' + (rs ? '?rs=1' : '');
    };
    var out = {
      hmOpen: open, hmIsOpen: !!h, hmClose: close,
      hmBack: function (e) { if (e.target === e.currentTarget || (e.target && e.target.id === 'km-hm-back')) close(); },
      hmSetCode: function (e) { set({ code: e.target.value, err: '' }); },
      hmSetPhone: function (e) { set({ phone: e.target.value, err: '' }); },
      hmAgain: function () { set({ info: null, err: '' }); setTimeout(function () { var i = document.getElementById('km-hm-code'); if (i) i.focus(); }, 0); },
      hmGo: function () { go(true); }, hmView: function () { go(false); },
      hmFind: function () {
        var cur = inst.state.hm;
        if (!cur || cur.busy) return;
        var code = String(cur.code || '').trim().toUpperCase();
        var phone = String(cur.phone || '').trim();
        if (!code || !phone) return set({ err: 'กรุณากรอกทั้งรหัสการจองและเบอร์โทร' });
        set({ busy: true, err: '', code: code });
        kmApi('publicRescheduleInfo', code, phone).then(function (info) { set({ busy: false, info: info }); }, function (e) {
          var m = String((e && e.message) || e);
          set({ busy: false, err: /ไม่รู้จักคำสั่ง/.test(m) ? 'ระบบเลื่อนวันพักยังไม่เปิดใช้งาน กรุณาติดต่อที่พัก' : m.replace(/^BUSY:\s*/, '') });
        });
      },
      hm: {}
    };
    if (h) {
      var info = h.info;
      var range = function (a, b) { return kmDate.short(a) + ' – ' + kmDate.short(b); };
      var note = '';
      if (info) {
        if (info.used) note = 'การจองนี้เลื่อนวันพักไปแล้ว (เดิม ' + range(info.prevCheckIn, info.prevCheckOut) + ') ใช้สิทธิ์ครบ 1 ครั้ง หากต้องการเปลี่ยนอีก กรุณาติดต่อที่พัก';
        else if (!info.can) note = info.reason;
        else note = 'กด "เลือกวันเข้าพักใหม่" เพื่อดูปฏิทินห้องว่างและเลือกวันใหม่';
      }
      out.hm = {
        code: h.code, phone: h.phone, err: h.err, busy: !!h.busy,
        findLabel: h.busy ? 'กำลังค้นหา…' : 'ค้นหาการจอง',
        showFind: !info, found: !!info,
        codeLine: info ? 'การจอง ' + info.code : '',
        room: info ? info.roomName : '',
        dates: info ? range(info.checkIn, info.checkOut) + ' (' + info.nights + ' คืน)' : '',
        note: note,
        canGo: !!(info && info.can && !info.used),
        canView: !!(info && !(info.can && !info.used) && RS_STATUSES.concat(['checked_in']).indexOf(info.status) >= 0)
      };
    }
    return out;
  }

  function patchHomeClass(C) {
    var P = C.prototype;
    if (P.__rs) return;
    P.__rs = true;
    var rv = P.renderVals;
    P.renderVals = function () {
      homeInst = this;
      var v = rv.call(this);
      var x = homeVals(this);
      for (var k in x) v[k] = x[k];
      return v;
    };
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && homeInst && homeInst.state && homeInst.state.hm && document.getElementById('km-hm-back')) homeInst.setState({ hm: null });
  });

  /* ---------- เชื่อมกับตัวแสดงผลของหน้า ---------- */
  var mount = window.DC.mount;
  window.DC.mount = function (C, props, opts) {
    var tpl = (opts && opts.tpl) || document.getElementById('view');
    try {
      if (tpl && tpl.content && C && C.prototype) {
        if (deepFind(tpl.content, 'section[aria-labelledby="h-track"]')) { patchBookingTpl(tpl); patchBookingClass(C); }
        else if (deepFind(tpl.content, '#h-book')) { patchAdminTpl(tpl); patchAdminClass(C); }
        else if (deepFind(tpl.content, 'form.finder')) { patchHomeTpl(tpl); patchHomeClass(C); }
      }
    } catch (e) {
      if (window.console) console.error('reschedule.js: ' + e);   // ไม่ให้หน้าหลักพังถ้าเกิดปัญหา
    }
    return mount.apply(this, arguments);
  };
})();
