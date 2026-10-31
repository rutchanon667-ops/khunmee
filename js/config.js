/* ตั้งค่าการเชื่อมต่อกับ Google Apps Script
 * วาง URL ของ Web App ที่ได้จาก Deploy → New deployment (ลงท้ายด้วย /exec) */
window.KM_CONFIG = {
  API_URL: 'PASTE_YOUR_WEB_APP_URL_HERE',

  // รูปของแต่ละห้อง จับคู่กับคอลัมน์ roomNo ในแท็บ Rooms
  ROOM_IMAGES: {
    '1': 'images/room-shoji.jpg',
    '2': 'images/room-hinoki.jpg',
    '3': 'images/room-yane-1.jpg',
    '4': 'images/room-komorebi.jpg'
  },
  DEFAULT_ROOM_IMAGE: 'images/room-yane-2.jpg'
};
