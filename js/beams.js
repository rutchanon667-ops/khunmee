/* Khun Mee: ลำแสงพื้นหลังทุกหน้า (ดัดแปลงจาก background-beams)
 * สีพื้นเดิม เพิ่มเฉพาะเส้นโค้ง 50 เส้นพาดเฉียงเต็มจอ มีแสงค่อยๆ วิ่งไปตามเส้น แต่ละเส้นเร็วช้าไม่เท่ากัน
 * วางไว้นอก #app (ไม่โดนการวาดหน้าใหม่) · ผู้ใช้ที่ตั้งลดภาพเคลื่อนไหว เห็นเฉพาะเส้นจางที่อยู่นิ่ง */
(function () {
  'use strict';
  if (window.__kmBeams) return;
  window.__kmBeams = true;
  var NS = 'http://www.w3.org/2000/svg';
  var BEAMS = 50, BASE = 58;
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function d(i) {
    var x = 7 * i, y = -8 * i;
    function p(a, b) { return (a + x) + ' ' + (b + y); }
    return 'M' + p(-380, -189) + 'C' + p(-380, -189) + ' ' + p(-312, 216) + ' ' + p(152, 343) +
      'C' + p(616, 470) + ' ' + p(684, 875) + ' ' + p(684, 875);
  }
  var all = [];
  for (var i = 0; i < BASE; i++) all.push(d(i));
  var paths = '', grads = '';
  for (var k = 0; k < BEAMS; k++) {
    var dur = (rnd() * 10 + 10).toFixed(1) + 's', begin = (rnd() * 10).toFixed(1) + 's', y2 = (93 + rnd() * 8).toFixed(1) + '%';
    var an = function (att, vals) {
      return '<animate attributeName="' + att + '" values="' + vals + '" dur="' + dur + '" begin="' + begin +
        '" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1"/>';
    };
    grads += '<linearGradient id="kmb' + k + '" x1="0%" x2="0%" y1="0%" y2="0%">' +
      an('x1', '0%;100%') + an('x2', '0%;95%') + an('y1', '0%;100%') + an('y2', '0%;' + y2) +
      '<stop stop-color="#C98B5B" stop-opacity="0"/><stop stop-color="#C98B5B"/>' +
      '<stop offset="32.5%" stop-color="#A1805D"/><stop offset="100%" stop-color="#DCC881" stop-opacity="0"/></linearGradient>';
    paths += '<path d="' + all[k] + '" stroke="url(#kmb' + k + ')" stroke-opacity="0.4" stroke-width="1.2" vector-effect="non-scaling-stroke"/>';
  }
  var svg = '<svg xmlns="' + NS + '" class="km-beams" aria-hidden="true" focusable="false" viewBox="0 0 696 316" preserveAspectRatio="xMidYMid slice" fill="none">' +
    '<path d="' + all.join('') + '" stroke="url(#kmbR)" stroke-opacity="0.09" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
    '<g class="km-beams-run">' + paths + '</g><defs>' + grads +
    '<radialGradient id="kmbR" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(352 34) rotate(90) scale(555 1560.62)">' +
    '<stop offset="0.0667" stop-color="#A1805D"/><stop offset="0.2432" stop-color="#A1805D"/><stop offset="0.4359" stop-color="#A1805D" stop-opacity="0"/></radialGradient>' +
    '</defs></svg>';

  var css = document.createElement('style');
  css.textContent =
    '.km-beams{position:fixed;inset:0;width:100vw;height:100vh;height:100lvh;z-index:0;pointer-events:none}' +
    '#app{position:relative;z-index:1}' +
    '@media (prefers-reduced-motion:reduce){.km-beams-run{display:none}}' +
    '@media print{.km-beams{display:none}}';
  function add() {
    if (document.querySelector('svg.km-beams')) return;
    document.head.appendChild(css);
    var box = document.createElement('div');
    box.innerHTML = svg;
    document.body.insertBefore(box.firstChild, document.body.firstChild);
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
