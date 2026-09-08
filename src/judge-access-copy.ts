export const judgeAccessRows = `
Welcome to Hum Ahang|ہم آہنگ میں خوش آمدید|Hum Ahang mein khush aamdeed
Private judge preview|منصفین کے لیے خصوصی پیش نظارہ|Munsifeen ke liye khusoosi pesh nazara
Preparing your demo…|آپ کی نمائش تیار ہو رہی ہے…|Aap ki numaish tayyar ho rahi hai…
Your demo is ready|آپ کی نمائش تیار ہے|Aap ki numaish tayyar hai
Continue your demo|اپنی نمائش جاری رکھیں|Apni numaish jaari rakhein
Your existing connection has not been rechecked. Reopen the original private demo link if a feature asks to reconnect.|آپ کے موجودہ رابطے کی دوبارہ جانچ نہیں ہوئی۔ اگر کوئی سہولت دوبارہ رابطہ مانگے تو اصل خصوصی نمائش کا ربط دوبارہ کھولیں۔|Aap ke maujooda raabte ki dobara jaanch nahin hui. Agar koi sahulat dobara raabta maange to asal khusoosi numaish ka link dobara kholein.
Demo connection needs attention|نمائش کے رابطے پر توجہ درکار ہے|Numaish ke raabte par tawajjuh darkar hai
Speech and photo features are connected. Choose a feature to begin.|آواز اور تصویر کی سہولتیں منسلک ہیں۔ شروع کرنے کے لیے سہولت منتخب کریں۔|Aawaz aur tasveer ki sahulatein munsalik hain. Shuru karne ke liye sahulat muntakhib karein.
Enter demo|نمائش شروع کریں|Numaish shuru karein
Retry demo connection|نمائش کا رابطہ دوبارہ آزمائیں|Numaish ka raabta dobara aazmayen
Explore without cloud features|آن لائن سہولتوں کے بغیر دیکھیں|Online sahulaton ke baghair dekhein
No microphone or camera starts automatically. This temporary connection stays only in this open app. After a reload or expiry, reopen the original private demo link.|مائیک یا کیمرا خود بخود شروع نہیں ہوتا۔ یہ عارضی رابطہ صرف کھلی ہوئی ایپ میں رہتا ہے۔ صفحہ دوبارہ کھولنے یا مدت ختم ہونے پر اصل خصوصی نمائش کا ربط دوبارہ کھولیں۔|Mic ya camera khud bakhud shuru nahin hota. Yeh aarzi raabta sirf khuli hui app mein rehta hai. Safha dobara kholne ya muddat khatam hone par asal khusoosi numaish ka link dobara kholein.
Open the private demo link provided by the project team. No terminal or pairing code is needed.|منصوبے کی ٹیم کا دیا ہوا خصوصی نمائش کا ربط کھولیں۔ ٹرمینل یا رابطے کے کوڈ کی ضرورت نہیں۔|Mansoobe ki team ka diya hua khusoosi numaish ka link kholein. Terminal ya raabte ke code ki zaroorat nahin.
This demo link is expired or incorrect. Ask the project team for an updated link.|نمائش کا یہ ربط غلط ہے یا اس کی مدت ختم ہو گئی ہے۔ منصوبے کی ٹیم سے نیا ربط مانگیں۔|Numaish ka yeh link ghalat hai ya is ki muddat khatam ho gayi hai. Mansoobe ki team se naya link maangein.
Judge access is not available right now. Please contact the project team.|منصفین کی رسائی اس وقت دستیاب نہیں۔ منصوبے کی ٹیم سے رابطہ کریں۔|Munsifeen ki rasai is waqt dastiyab nahin. Mansoobe ki team se raabta karein.
The demo is busy or its access limit has been reached. Please retry shortly or contact the project team.|نمائش مصروف ہے یا رسائی کی حد پوری ہو گئی ہے۔ کچھ دیر بعد دوبارہ کوشش کریں یا منصوبے کی ٹیم سے رابطہ کریں۔|Numaish masroof hai ya rasai ki hadd poori ho gayi hai. Kuch dair baad dobara koshish karein ya mansoobe ki team se raabta karein.
Cannot reach the demo service. Check your internet connection and retry.|نمائش کی سروس سے رابطہ نہیں ہو سکا۔ انٹرنیٹ کا رابطہ چیک کر کے دوبارہ کوشش کریں۔|Numaish ki service se raabta nahin ho saka. Internet ka raabta check kar ke dobara koshish karein.
The demo service could not establish a safe connection. Please retry.|نمائش کی سروس محفوظ رابطہ قائم نہیں کر سکی۔ دوبارہ کوشش کریں۔|Numaish ki service mehfooz raabta qaim nahin kar saki. Dobara koshish karein.
`.trim().split('\n').map(line => line.split('|'));
