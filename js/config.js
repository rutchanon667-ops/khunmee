/* ตั้งค่าการเชื่อมต่อกับ Google Apps Script
 * วาง URL ของ Web App ที่ได้จาก Deploy → New deployment (ลงท้ายด้วย /exec) */
window.KM_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbykv7GdymCAGbPUzIFcMyxoYyQxG70KbAmccKtjP-VatK0k6SfQNRU7whOGZI4HTpOYVA/exec',

  // รูปของแต่ละห้อง จับคู่กับคอลัมน์ roomNo ในแท็บ Rooms
  ROOM_IMAGES: {
    '1': 'images/room-shoji.jpg',
    '2': 'images/room-hinoki.jpg',
    '3': 'images/room-yane-1.jpg',
    '4': 'images/room-komorebi.jpg'
  },
  DEFAULT_ROOM_IMAGE: 'images/room-yane-2.jpg',

  // LINE ID ของ LINE OA เช่น '@khunmhee' (ดูที่หน้าแรกของ LINE OA Manager)
  // ใส่ไว้แล้วปุ่ม "รับรหัสประตูทาง LINE" จะแสดงเสมอ แม้ระบบหลังบ้านยังไม่ได้ตั้ง LINE_OA_ID
  LINE_OA_ID: '@413bzbdc'
};

/** ลิงก์เปิดแชท LINE OA: ใช้ค่าจากระบบหลังบ้านก่อน ถ้าไม่มีใช้ LINE_OA_ID ด้านบน */
window.kmLineChatUrl = function (line) {
  if (line && line.chatUrl) return line.chatUrl;
  var id = String((window.KM_CONFIG || {}).LINE_OA_ID || '').replace(/\s+/g, '');
  if (!id) return '';
  return 'https://line.me/R/ti/p/' + encodeURIComponent(id.charAt(0) === '@' ? id : '@' + id);
};
