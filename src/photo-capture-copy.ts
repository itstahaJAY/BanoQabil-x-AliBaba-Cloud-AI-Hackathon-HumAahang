export const photoCaptureRows = `
Take a photo|تصویر لیں|Tasveer lein
Close camera|کیمرا بند کریں|Camera band karein
Starting camera…|کیمرا شروع ہو رہا ہے…|Camera shuru ho raha hai…
Hold steady and keep the object in view|فون کو ساکن رکھیں اور چیز کو سامنے رکھیں|Phone saakin rakhein aur cheez ko saamne rakhein
Capturing photo…|تصویر لی جا رہی ہے…|Tasveer li ja rahi hai…
Capture photo|تصویر لیں|Tasveer lein
Switch front or back camera|آگے یا پیچھے کا کیمرا بدلیں|Aage ya peechhe ka camera badlein
Checking camera access…|کیمرا کی اجازت چیک ہو رہی ہے…|Camera ki ijazat check ho rahi hai…
Camera unavailable|کیمرا دستیاب نہیں|Camera dastiyab nahin
Allow camera access to take a photo|تصویر لینے کے لیے کیمرا کی اجازت دیں|Tasveer lene ke liye camera ki ijazat dein
Only a photo is captured. No audio is recorded.|صرف تصویر لی جاتی ہے۔ آواز ریکارڈ نہیں ہوتی۔|Sirf tasveer li jati hai. Aawaz record nahin hoti.
In a browser, use HTTPS or localhost and allow this site to use the camera.|براؤزر میں HTTPS یا localhost استعمال کریں اور اس سائٹ کو کیمرا کی اجازت دیں۔|Browser mein HTTPS ya localhost istemal karein aur is site ko camera ki ijazat dein.
Waiting for camera permission…|کیمرا کی اجازت کا انتظار ہے…|Camera ki ijazat ka intezar hai…
Retry camera|کیمرا دوبارہ چلائیں|Camera dobara chalayen
Allow camera|کیمرا کی اجازت دیں|Camera ki ijazat dein
Open device settings|آلے کی ترتیبات کھولیں|Device ki settings kholein
Camera did not start. Close other camera apps, then try again.|کیمرا شروع نہیں ہوا۔ کیمرا استعمال کرنے والی دوسری ایپس بند کریں، پھر دوبارہ کوشش کریں۔|Camera shuru nahin hua. Camera istemal karne wali doosri apps band karein, phir dobara koshish karein.
Camera access was not allowed. You can retry or change camera permission in settings.|کیمرا کی اجازت نہیں ملی۔ دوبارہ کوشش کریں یا ترتیبات میں کیمرا کی اجازت بدلیں۔|Camera ki ijazat nahin mili. Dobara koshish karein ya settings mein camera ki ijazat badlein.
Camera access is unavailable. Check camera permission and try again.|کیمرا دستیاب نہیں ہے۔ کیمرا کی اجازت چیک کریں اور دوبارہ کوشش کریں۔|Camera dastiyab nahin hai. Camera ki ijazat check karein aur dobara koshish karein.
This photo is too large. Move closer to one object and take another photo.|یہ تصویر بہت بڑی ہے۔ ایک چیز کے قریب جائیں اور دوسری تصویر لیں۔|Yeh tasveer bohat bari hai. Aik cheez ke qareeb jayein aur doosri tasveer lein.
The photo could not be captured. Hold the phone steady and try again.|تصویر نہیں لی جا سکی۔ فون کو ساکن رکھیں اور دوبارہ کوشش کریں۔|Tasveer nahin li ja saki. Phone ko saakin rakhein aur dobara koshish karein.
Open your device settings and allow camera access for this app.|اپنے آلے کی ترتیبات کھولیں اور اس ایپ کو کیمرا کی اجازت دیں۔|Apne device ki settings kholein aur is app ko camera ki ijazat dein.
`.trim().split('\n').map(line => line.split('|'));
