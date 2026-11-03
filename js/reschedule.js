/* Khun Mhee: ระบบเลื่อนวันพัก (เลื่อนได้ครั้งเดียวต่อการจอง)
 *
 * ติดตั้ง: วางไฟล์นี้ที่ js/reschedule.js แล้วเพิ่มบรรทัดนี้ใน index.html, admin.html และ reschedule.html
 *   (booking.html ไม่ต้องมีแล้ว แต่ถ้ามีอยู่ก็ไม่เป็นไร ไฟล์นี้จะไม่แตะหน้าจอง)
 *   <script src="js/reschedule.js"></script>
 * ต่อจากบรรทัด <script src="js/api.js"></script> (ก่อนสคริปต์ของหน้า)
 * ต้องติดตั้ง Reschedule.gs ใน Apps Script ด้วย ถ้ายังไม่ติดตั้ง ส่วนเลื่อนวันพักจะไม่แสดง (หน้าอื่นทำงานปกติ)
 *
 * หน้าแรก: ลิงก์ "เลื่อนวันพัก" (แถบเมนู ใต้กล่องค้นหาห้องว่าง และส่วนท้าย) ไปหน้า reschedule.html
 * หน้าเลื่อนวันพัก (reschedule.html): ค้นหาการจองด้วยรหัส + เบอร์โทร แล้วเลือกวันใหม่จากปฏิทิน (ใช้ปฏิทินในไฟล์นี้)
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
   * หน้าแรก: ลิงก์ "เลื่อนวันพัก" ไปหน้า reschedule.html (แถบเมนู ใต้กล่องค้นหาห้องว่าง และส่วนท้าย)
   * ========================================================= */
  var HOME_NAV_HTML = '<a class="pill" href="reschedule.html" style="background: transparent; color: ' + PURPLE + '; border: 1px solid ' + PURPLE + '; border-radius: 9999px; padding: 5px 14px; font-size: 14px; white-space: nowrap; display: inline-block">เลื่อนวันพัก</a>';
  var HOME_HERO_HTML =
'<p style="margin: 20px 0 0; font-size: 15px; line-height: 1.6; color: #5E554C; text-align: center">จองไว้แล้วแต่อยากเปลี่ยนวัน? ' +
'<a href="reschedule.html" style="font-weight: 600; color: ' + PURPLE + '; text-decoration: underline; text-underline-offset: 3px">เลื่อนวันพักได้ 1 ครั้ง ›</a></p>';
  var HOME_FOOT_HTML = '<a href="reschedule.html" style="color: #5E554C">เลื่อนวันพัก</a>';

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
  }

  // ให้หน้า reschedule.html ใช้ปฏิทินชุดเดียวกัน
  window.kmRsCalendar = rsCalendar;
  window.kmRsNavStyle = navStyle;
  window.KM_RS_COLORS = { purple: PURPLE, soft: PURPLE_SOFT, ink: PURPLE_INK };

  /* ---------- เชื่อมกับตัวแสดงผลของหน้า ---------- */
  var mount = window.DC.mount;
  window.DC.mount = function (C, props, opts) {
    var tpl = (opts && opts.tpl) || document.getElementById('view');
    try {
      if (tpl && tpl.content && C && C.prototype) {
        if (deepFind(tpl.content, '#h-book')) { patchAdminTpl(tpl); patchAdminClass(C); }
        else if (deepFind(tpl.content, 'form.finder')) patchHomeTpl(tpl);
      }
    } catch (e) {
      if (window.console) console.error('reschedule.js: ' + e);   // ไม่ให้หน้าหลักพังถ้าเกิดปัญหา
    }
    return mount.apply(this, arguments);
  };
})();
