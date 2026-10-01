# ระบบเช็คชื่อผู้เข้ารับการฝึกอบรมด้วย QR + GPS
เทคโนโลยี: Google Apps Script Web App + Google Sheets + Browser Geolocation API

## 1. โครงสร้าง
- Courses: ข้อมูลหลักสูตร/รุ่น/สถานที่/พิกัด/รัศมี
- Trainees: รายชื่อผู้เข้ารับการฝึกอบรม
- Attendance: ประวัติการเช็คชื่อ
- Config: ค่า radius และ PIN ผู้ดูแล

## 2. เริ่มต้นใช้งาน
1. สร้าง Google Spreadsheet 1 ไฟล์
2. Extensions > Apps Script
3. สร้างไฟล์ Code.gs, Index.html, Admin.html และ appsscript.json ตามไฟล์นี้
4. วาง Code.gs, Index.html, Admin.html และ Manifest
5. Run ฟังก์ชัน setupSystem() หนึ่งครั้ง และอนุญาตสิทธิ์
6. เปิดชีต Config แล้วเปลี่ยน admin_pin จาก CHANGE_ME_1234 เป็น PIN จริง
7. ตั้งค่า Spreadsheet Time Zone เป็น Asia/Bangkok และ Apps Script Time Zone เป็น Asia/Bangkok
8. Deploy > New deployment > Web app
   - Execute as: Me
   - Who has access: Anyone
9. เปิด URL /exec?admin เพื่อจัดการหลักสูตรและสร้าง QR
   - หมายเหตุ: ถ้าใช้ URL ?page=admin ให้ใช้ .../exec?page=admin
10. สำหรับผู้เข้าอบรม URL QR จะอยู่ในรูป .../exec?course=COURSE_ID

## 3. ตัวอย่าง Courses
course_id | course_name | batch_no | training_date | venue_name | lat | lng | radius_m | active
TAK001 | การบำรุงรักษารถจักรยานยนต์ | 1 | 2026-09-28 | สพร.43 ตาก | 16.xxxxxx | 99.xxxxxx | 120 | TRUE

## 4. ตัวอย่าง Trainees
trainee_id | course_id | batch_no | name | id_card | phone | active
001 | TAK001 | 1 | นายตัวอย่าง ทดสอบ | | | TRUE

## 5. ขั้นตอนการเช็คชื่อ
1. ผู้ดูแลสร้างหลักสูตร/รุ่นและกำหนดพิกัดสถานที่
2. ระบบสร้าง QR เฉพาะ course_id
3. ผู้เข้าอบรมสแกน QR
4. กรอกรหัสผู้เข้าอบรม
5. Browser ขอ GPS
6. Server ตรวจหลักสูตร/รุ่น/วันที่/รอบ/รายชื่อ
7. คำนวณระยะทาง Haversine จากพิกัดฝึกอบรม
8. ถ้า distance <= radius_m และ GPS accuracy ผ่านเกณฑ์ จึงบันทึก Attendance
9. ระบบป้องกันเช็คชื่อซ้ำในวันเดียวกัน + หลักสูตร + รอบ

## 6. เรื่องสำคัญด้านความปลอดภัย
- Browser GPS ไม่สามารถรับประกันว่าเป็นตำแหน่งจริง 100% เพราะผู้ใช้บางรายอาจใช้ mock location หรืออุปกรณ์ที่ดัดแปลง
- QR นี้เป็นตัวระบุหลักสูตร/รุ่น ไม่ใช่ credential ลับระดับสูง
- หากต้องการป้องกันการส่งลิงก์ต่อ ควรเพิ่ม QR token แบบสุ่มที่หมดอายุเป็นรายวัน/รายรอบ และ/หรือให้เจ้าหน้าที่เปิด QR ใหม่ทุกช่วง
- อย่าเก็บเลขบัตรประชาชนถ้าไม่จำเป็น
- จำกัดสิทธิ์ Spreadsheet ให้เฉพาะเจ้าหน้าที่
- สำหรับการใช้งานจริง ควรเพิ่ม Audit Log และสำรองข้อมูล

## 7. การปรับเวลาเช้า/บ่าย
ค่า default ใช้ก่อน 13:00 = เช้า, ตั้งแต่ 13:00 = บ่าย
แต่หน้าเว็บให้ผู้ใช้เลือกได้เอง หากต้องการบังคับตามเวลา ให้เปลี่ยน logic ใน checkIn() ให้ตรวจ session กับเวลาปัจจุบัน

## 8. หมายเหตุเรื่องรัศมี 120 เมตร
ระบบคำนวณระยะทางบนเซิร์ฟเวอร์ด้วย Haversine และใช้ radius_m จาก Courses
จึงสามารถกำหนด 120 เมตรเป็นค่าเริ่มต้น และปรับเป็นรายหลักสูตรได้


## ระบบป้องกันใช้โทรศัพท์เครื่องเดียวกันเช็คชื่อแทนหลายคน
เพิ่ม Device ID แบบ UUID เก็บใน localStorage และบันทึกใน Attendance โดยวัน+หลักสูตร+รุ่น+รอบเดียวกัน หาก Device ID เดิมถูกใช้เช็คชื่อสำเร็จแล้วและพยายามใช้กับ trainee คนอื่น ระบบจะปฏิเสธ

ข้อจำกัด: Web App ไม่สามารถอ่าน IMEI/Serial ของเครื่องได้โดยตรง Device ID จึงไม่ใช่ Hardware ID 100% และอาจเปลี่ยนเมื่อผู้ใช้ล้างข้อมูลเว็บไซต์ เปลี่ยนเบราว์เซอร์ หรือใช้โหมดไม่ระบุตัวตน ดังนั้นควรใช้ร่วมกับ GPS 120 เมตร และ QR แบบ Dynamic ที่หมดอายุรายรอบ
