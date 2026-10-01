/**
 * ระบบเช็คชื่อผู้เข้ารับการฝึกอบรม
 * Google Apps Script + Google Sheets
 *
 * Sheets:
 * 1) Courses
 * 2) Trainees
 * 3) Attendance
 * 4) Config
 *
 * แนะนำให้สร้าง Spreadsheet แล้วผูก Apps Script กับไฟล์นั้น
 */

const SHEETS = {
  COURSES: 'Courses',
  TRAINEES: 'Trainees',
  ATTENDANCE: 'Attendance',
  CONFIG: 'Config'
};

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'checkin';
  const template = HtmlService.createTemplateFromFile(page === 'admin' ? 'Admin' : 'Index');
  template.baseUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(page === 'admin' ? 'ระบบจัดการเช็คชื่อฝึกอบรม' : 'เช็คชื่อเข้าฝึกอบรม')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ใช้ครั้งแรกเพื่อสร้างหัวตาราง */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    [SHEETS.COURSES]: [
      'course_id','course_name','batch_no','training_date','venue_name',
      'lat','lng','radius_m','active'
    ],
    [SHEETS.TRAINEES]: [
      'trainee_id','course_id','batch_no','name','id_card','phone','active'
    ],
    [SHEETS.ATTENDANCE]: [
      'timestamp','attendance_date','course_id','batch_no','trainee_id','name',
      'session','lat','lng','accuracy_m','distance_m','device_id','result','user_agent'
    ],
    [SHEETS.CONFIG]: ['key','value']
  };

  Object.keys(schemas).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1,1,1,schemas[name].length).setValues([schemas[name]]);
    sh.setFrozenRows(1);
  });

  const cfg = ss.getSheetByName(SHEETS.CONFIG);
  cfg.getRange(2,1,3,2).setValues([
    ['default_radius_m', '120'],
    ['timezone', Session.getScriptTimeZone() || 'Asia/Bangkok'],
    ['admin_pin', 'CHANGE_ME_1234']
  ]);
  return 'สร้างโครงสร้างระบบเรียบร้อย กรุณาเปลี่ยน admin_pin ในชีต Config';
}

function getSS_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' กรุณาเรียก setupSystem() ก่อน');
  return sh;
}

function rowsToObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => v !== '')).map(row => {
    const o = {};
    headers.forEach((h,i) => o[h] = row[i]);
    return o;
  });
}

function normalizeDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return String(v || '').trim().substring(0,10);
}

function normalizeBool_(v) {
  if (v === true) return true;
  return ['true','1','yes','y','ใช่','เปิด','active'].includes(String(v).trim().toLowerCase());
}

function getCourseByQR(qrToken) {
  qrToken = String(qrToken || '').trim();
  if (!qrToken) throw new Error('ไม่พบข้อมูล QR');

  const courses = rowsToObjects_(SHEETS.COURSES);
  const c = courses.find(x => String(x.course_id).trim() === qrToken && normalizeBool_(x.active));
  if (!c) throw new Error('QR นี้ไม่ตรงกับหลักสูตร/รุ่นที่เปิดใช้งาน');

  return {
    course_id: String(c.course_id),
    course_name: String(c.course_name),
    batch_no: String(c.batch_no),
    training_date: normalizeDate_(c.training_date),
    venue_name: String(c.venue_name || ''),
    lat: Number(c.lat),
    lng: Number(c.lng),
    radius_m: Number(c.radius_m || getConfig_('default_radius_m') || 120)
  };
}

function getTrainee(courseId, traineeId) {
  courseId = String(courseId || '').trim();
  traineeId = String(traineeId || '').trim();

  const trainees = rowsToObjects_(SHEETS.TRAINEES);
  const t = trainees.find(x =>
    String(x.course_id).trim() === courseId &&
    String(x.trainee_id).trim().toLowerCase() === traineeId.toLowerCase() &&
    normalizeBool_(x.active)
  );

  if (!t) throw new Error('ไม่พบรายชื่อผู้เข้ารับการฝึกอบรมในหลักสูตร/รุ่นนี้');

  return {
    trainee_id: String(t.trainee_id),
    name: String(t.name),
    course_id: String(t.course_id),
    batch_no: String(t.batch_no)
  };
}

function getConfig_(key) {
  const rows = rowsToObjects_(SHEETS.CONFIG);
  const item = rows.find(x => String(x.key).trim() === key);
  return item ? String(item.value) : '';
}

function haversineMeters_(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
}

function currentSession_() {
  // ปรับเวลาได้ตามหน่วยงาน
  const hour = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'H'));
  return hour < 13 ? 'morning' : 'afternoon';
}

function sessionLabel_(s) {
  return s === 'morning' ? 'เช้า' : 'บ่าย';
}

/**
 * ฟังก์ชันหลักสำหรับเช็คชื่อ
 * qrToken = course_id ที่ฝังอยู่ใน QR
 * traineeId = รหัสผู้เข้าอบรม
 * lat/lng/accuracy = GPS จากมือถือ
 * session = morning/afternoon
 */
function checkIn(payload) {
  if (!payload) throw new Error('ข้อมูลไม่ครบ');
  const qrToken = String(payload.qrToken || '').trim();
  const traineeId = String(payload.traineeId || '').trim();
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const accuracy = Number(payload.accuracy || 9999);
  const deviceId = String(payload.deviceId || '').trim();
  const session = String(payload.session || currentSession_());

  if (!qrToken || !traineeId) throw new Error('กรุณาสแกน QR และระบุรหัสผู้เข้าอบรม');
  if (!deviceId || deviceId.length < 16) throw new Error('ไม่พบรหัสอุปกรณ์ กรุณาเปิดหน้าเช็คชื่อใหม่');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('ไม่สามารถอ่านพิกัด GPS ได้');
  if (!['morning','afternoon'].includes(session)) throw new Error('รอบเช็คชื่อไม่ถูกต้อง');

  const course = getCourseByQR(qrToken);
  const trainee = getTrainee(course.course_id, traineeId);

  const today = today_();
  if (course.training_date && course.training_date !== today) {
    throw new Error('QR นี้ใช้สำหรับวันที่ ' + course.training_date + ' ไม่ใช่วันที่ ' + today);
  }

  const distance = haversineMeters_(lat, lng, course.lat, course.lng);
  const radius = Number(course.radius_m || 120);

  // ป้องกัน GPS ที่มีความคลาดเคลื่อนสูงผิดปกติ
  if (accuracy > Math.max(radius, 120)) {
    throw new Error('ความแม่นยำ GPS ต่ำเกินไป (' + Math.round(accuracy) + ' เมตร) กรุณาเปิด Location และลองใหม่ในพื้นที่โล่ง');
  }

  if (distance > radius) {
    throw new Error('อยู่นอกพื้นที่ฝึกอบรม ระยะห่างประมาณ ' + Math.round(distance) + ' เมตร (กำหนดไม่เกิน ' + Math.round(radius) + ' เมตร)');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_(SHEETS.ATTENDANCE);
    const values = sh.getDataRange().getValues();
    const headers = values[0].map(String);
    const idx = {};
    headers.forEach((h,i)=>idx[h]=i);

    // ป้องกันโทรศัพท์/อุปกรณ์เครื่องเดียวกันเช็คชื่อให้หลายคน
    for (let i=1; i<values.length; i++) {
      const row = values[i];
      const d = normalizeDate_(row[idx.attendance_date]);
      const cid = String(row[idx.course_id] || '').trim();
      const bid = String(row[idx.batch_no] || '').trim();
      const ses = String(row[idx.session] || '').trim();
      const existingDevice = String(row[idx.device_id] || '').trim();
      const result = String(row[idx.result] || '').trim();
      if (d === today && cid === course.course_id && bid === course.batch_no &&
          ses === session && existingDevice === deviceId && result === 'SUCCESS' &&
          String(row[idx.trainee_id] || '').trim().toLowerCase() !== trainee.trainee_id.toLowerCase()) {
        throw new Error('โทรศัพท์/อุปกรณ์เครื่องนี้ถูกใช้เช็คชื่อให้ผู้เข้าอบรมรายอื่นในรอบนี้แล้ว ไม่สามารถเช็คชื่อซ้ำได้');
      }
    }

    // ป้องกันเช็คชื่อซ้ำในวันเดียวกัน/หลักสูตรเดียวกัน/รอบเดียวกัน
    for (let i=1; i<values.length; i++) {
      const row = values[i];
      const d = normalizeDate_(row[idx.attendance_date]);
      const cid = String(row[idx.course_id] || '').trim();
      const tid = String(row[idx.trainee_id] || '').trim().toLowerCase();
      const ses = String(row[idx.session] || '').trim();
      const result = String(row[idx.result] || '').trim();

      if (d === today && cid === course.course_id &&
          tid === trainee.trainee_id.toLowerCase() &&
          ses === session && result === 'SUCCESS') {
        return {
          ok: false,
          duplicate: true,
          message: 'คุณเช็คชื่อรอบ' + sessionLabel_(session) + 'แล้ว',
          trainee: trainee,
          course: course,
          distance: Math.round(distance)
        };
      }
    }

    sh.appendRow([
      new Date(),
      today,
      course.course_id,
      course.batch_no,
      trainee.trainee_id,
      trainee.name,
      session,
      lat,
      lng,
      accuracy,
      distance,
      deviceId,
      'SUCCESS',
      String(payload.userAgent || '').substring(0,500)
    ]);

    return {
      ok: true,
      message: 'เช็คชื่อสำเร็จ รอบ' + sessionLabel_(session),
      trainee: trainee,
      course: course,
      distance: Math.round(distance)
    };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Admin ---------- */

function adminLogin(pin) {
  const saved = getConfig_('admin_pin');
  if (!saved || saved === 'CHANGE_ME_1234') {
    return {ok:false, message:'กรุณาตั้งค่า admin_pin ในชีต Config ก่อน'};
  }
  return {ok: String(pin || '') === saved, message: String(pin || '') === saved ? 'เข้าสู่ระบบสำเร็จ' : 'PIN ไม่ถูกต้อง'};
}

function listCourses(pin) {
  if (!adminLogin(pin).ok) throw new Error('ไม่ได้รับอนุญาต');
  return rowsToObjects_(SHEETS.COURSES).map(c => ({
    course_id:String(c.course_id),
    course_name:String(c.course_name),
    batch_no:String(c.batch_no),
    training_date:normalizeDate_(c.training_date),
    venue_name:String(c.venue_name||''),
    lat:Number(c.lat),
    lng:Number(c.lng),
    radius_m:Number(c.radius_m||120),
    active:normalizeBool_(c.active)
  }));
}

function saveCourse(pin, data) {
  if (!adminLogin(pin).ok) throw new Error('ไม่ได้รับอนุญาต');
  const sh = getSheet_(SHEETS.COURSES);
  const course = {
    course_id:String(data.course_id||'').trim(),
    course_name:String(data.course_name||'').trim(),
    batch_no:String(data.batch_no||'').trim(),
    training_date:String(data.training_date||'').trim(),
    venue_name:String(data.venue_name||'').trim(),
    lat:Number(data.lat),
    lng:Number(data.lng),
    radius_m:Number(data.radius_m||120),
    active:Boolean(data.active)
  };
  if (!course.course_id || !course.course_name || !course.batch_no || !course.training_date ||
      !Number.isFinite(course.lat) || !Number.isFinite(course.lng)) {
    throw new Error('ข้อมูลหลักสูตรไม่ครบ');
  }

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = {}; headers.forEach((h,i)=>idx[h]=i);
  let found = -1;
  for(let i=1;i<values.length;i++){
    if(String(values[i][idx.course_id]).trim() === course.course_id){ found=i+1; break; }
  }
  const row = [
    course.course_id,course.course_name,course.batch_no,course.training_date,
    course.venue_name,course.lat,course.lng,course.radius_m,course.active
  ];
  if(found > 0) sh.getRange(found,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
  return {ok:true};
}

function saveTrainee(pin, data) {
  if (!adminLogin(pin).ok) throw new Error('ไม่ได้รับอนุญาต');
  const sh = getSheet_(SHEETS.TRAINEES);
  const row = [
    String(data.trainee_id||'').trim(),
    String(data.course_id||'').trim(),
    String(data.batch_no||'').trim(),
    String(data.name||'').trim(),
    String(data.id_card||'').trim(),
    String(data.phone||'').trim(),
    data.active !== false
  ];
  if(!row[0] || !row[1] || !row[2] || !row[3]) throw new Error('ข้อมูลผู้เข้าอบรมไม่ครบ');
  sh.appendRow(row);
  return {ok:true};
}

function getAttendance(pin, filters) {
  if (!adminLogin(pin).ok) throw new Error('ไม่ได้รับอนุญาต');
  const rows = rowsToObjects_(SHEETS.ATTENDANCE);
  const f = filters || {};
  return rows.filter(r => {
    const d = normalizeDate_(r.attendance_date);
    return (!f.date || d === f.date) &&
           (!f.course_id || String(r.course_id) === String(f.course_id)) &&
           (!f.session || String(r.session) === String(f.session));
  }).map(r => ({
    timestamp: String(r.timestamp),
    attendance_date: normalizeDate_(r.attendance_date),
    course_id:String(r.course_id),
    batch_no:String(r.batch_no),
    trainee_id:String(r.trainee_id),
    name:String(r.name),
    session:String(r.session),
    lat:Number(r.lat),
    lng:Number(r.lng),
    accuracy_m:Number(r.accuracy_m),
    distance_m:Number(r.distance_m),
    device_id:String(r.device_id || ''),
    result:String(r.result)
  }));
}
