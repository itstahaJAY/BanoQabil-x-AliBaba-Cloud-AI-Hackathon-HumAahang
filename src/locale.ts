import { translationRows } from './translations.ts';
import { getEmergencyCopy } from './emergency-copy.ts';
import { getContactQrCopy } from './contact-qr-copy.ts';
import { captionInputRows } from './caption-input-copy.ts';
import { navigationGestureRows } from './navigation-gesture-copy.ts';
import { captionSimpleRows } from './caption-simple-copy.ts';
import { photoCaptureRows } from './photo-capture-copy.ts';
import { visionRows } from './vision-copy.ts';

export const languageChoices = ['English', 'اردو', 'Roman Urdu'] as const;
export type AppLanguage = typeof languageChoices[number];
export function localeDirection(language: string): 'rtl' | 'ltr' {
  return language === 'اردو' || language === 'Urdu' ? 'rtl' : 'ltr';
}
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const catalogs = { ur: new Map<string, string>(), roman: new Map<string, string>() };
// Live-caption copy stays separate from the device-recognition copy still used by chat/FTF.
const captionRows = `
Speak naturally. Read in Urdu or English.|آسانی سے بولیں۔ اردو یا انگریزی میں پڑھیں۔|Aasani se bolein. Urdu ya English mein parhein.
Cancel microphone start|مائیک شروع کرنا منسوخ کریں|Mic shuru karna mansookh karein
Stop microphone|مائیک بند کریں|Mic band karein
Retry microphone|مائیک دوبارہ چلائیں|Mic dobara chalayen
Start microphone|مائیک شروع کریں|Mic shuru karein
Sends microphone audio to the configured speech provider and finalized text to DeepSeek.|مائیک کی آواز منتخب آواز کی سروس اور مکمل متن ڈیپ سیک کو بھیجتا ہے۔|Mic ki aawaz muntakhib aawaz ki service aur mukammal matn DeepSeek ko bhejta hai.
Listening · tap to stop|سن رہا ہے · بند کرنے کے لیے دبائیں|Sun raha hai · Band karne ke liye dabayen
Microphone off · processing captured speech|مائیک بند ہے · ریکارڈ شدہ گفتگو تیار ہو رہی ہے|Mic band hai · Record shuda guftagu tayyar ho rahi hai
English, Urdu, or both. No language setup.|انگریزی، اردو یا دونوں۔ زبان چننے کی ضرورت نہیں۔|English, Urdu ya dono. Zabaan chunne ki zaroorat nahin.
Starting sends audio to OpenAI (or Deepgram if the operator selects rollback), and finalized text to DeepSeek for both translations. Check important details; AI can make mistakes.|شروع کرنے پر آواز اوپن اے آئی کو (یا منتظم کی منتخب کردہ پچھلی سروس ڈیپ گرام کو)، اور مکمل متن دونوں ترجموں کے لیے ڈیپ سیک کو بھیجا جاتا ہے۔ اہم تفصیلات کی جانچ کریں؛ مصنوعی ذہانت غلطی کر سکتی ہے۔|Shuru karne par aawaz OpenAI ko (ya muntazim ki muntakhib pichhli service Deepgram ko), aur mukammal matn dono tarjumo ke liye DeepSeek ko bheja jata hai. Aham tafseelat ki jaanch karein; AI ghalti kar sakti hai.
Speech server connected|گفتگو کے سرور سے رابطہ ہے|Guftagu ke server se raabta hai
Connect to speech server|گفتگو کے سرور سے جوڑیں|Guftagu ke server se jorein
Disconnect speech server|گفتگو کے سرور سے رابطہ ختم کریں|Guftagu ke server se raabta khatam karein
Use the one-time pairing code from your local speech server. Do not enter an API key.|اپنے مقامی گفتگو سرور کا ایک بار استعمال ہونے والا رابطہ کوڈ لکھیں۔ اے پی آئی کی درج نہ کریں۔|Apne local speech server ka aik baar istemal hone wala pairing code likhein. API key darj na karein.
Pairing code|رابطہ کوڈ|Pairing code
Enter pairing code|رابطہ کوڈ لکھیں|Pairing code likhein
Connecting speech server…|گفتگو کے سرور سے رابطہ ہو رہا ہے…|Guftagu ke server se raabta ho raha hai…
Connect|جوڑیں|Jorein
Could not connect. Check the server and request a fresh pairing code.|رابطہ نہیں ہو سکا۔ سرور چیک کریں اور نیا رابطہ کوڈ حاصل کریں۔|Raabta nahin ho saka. Server check karein aur naya pairing code hasil karein.
Caption output|گفتگو کا ترجمہ|Guftagu ka tarjuma
Caption output language|گفتگو کے ترجمے کی زبان|Guftagu ke tarjume ki zabaan
Urdu output|اردو ترجمہ|Urdu tarjuma
English output|انگریزی ترجمہ|English tarjuma
Changes the displayed translation, not what you can speak.|یہ صرف دکھائے جانے والے ترجمے کو بدلتا ہے، بولنے کی زبان کو نہیں۔|Yeh sirf dikhaye jane wale tarjume ko badalta hai, bolne ki zabaan ko nahin.
Manual transcript · not translated|خود لکھا متن · ترجمہ نہیں ہوا|Khud likha matn · Tarjuma nahin hua
Your edits do not change or translate the live captions.|آپ کی ترمیم براہِ راست گفتگو کو تبدیل یا ترجمہ نہیں کرتی۔|Aap ki tarmeem barah-e-raast guftagu ko tabdeel ya tarjuma nahin karti.
Return to live captions|براہِ راست گفتگو پر واپس|Barah-e-raast guftagu par wapas
Edit manual transcript|خود لکھے متن میں ترمیم|Khud likhe matn mein tarmeem
Type a manual transcript|خود متن لکھیں|Khud matn likhein
Listening for your words|آپ کی گفتگو سن رہے ہیں|Aap ki guftagu sun rahe hain
Your words, in two languages|آپ کی گفتگو، دو زبانوں میں|Aap ki guftagu, do zabaanon mein
Speak a sentence. Its Urdu and English versions will appear after processing.|ایک جملہ بولیں۔ تیار ہونے کے بعد اس کا اردو اور انگریزی ترجمہ دکھایا جائے گا۔|Aik jumla bolein. Tayyar hone ke baad us ka Urdu aur English tarjuma dikhaya jayega.
Tap the microphone to begin. Urdu captions appear first; English is one tap away.|شروع کرنے کے لیے مائیک دبائیں۔ پہلے اردو متن دکھے گا؛ ایک بار دبانے پر انگریزی بھی ملے گی۔|Shuru karne ke liye mic dabayen. Pehle Urdu matn dikhega; aik baar dabane par English bhi milegi.
Preparing {count} caption segments…|گفتگو کے {count} حصے تیار ہو رہے ہیں…|Guftagu ke {count} hisse tayyar ho rahe hain…
Cancel pending captions · keep completed text|زیرِ تکمیل گفتگو منسوخ کریں · مکمل متن رکھیں|Zair-e-takmeel guftagu mansookh karein · Mukammal matn rakhein
Stop recording and wait for processing before editing or saving.|ترمیم یا محفوظ کرنے سے پہلے ریکارڈنگ بند کریں اور متن تیار ہونے کا انتظار کریں۔|Tarmeem ya mehfooz karne se pehle recording band karein aur matn tayyar hone ka intezar karein.
Save keeps only the displayed text on this device, not audio. Local storage is not encrypted by this app.|محفوظ کرنے پر اسی آلے میں صرف دکھایا گیا متن رہتا ہے، آواز نہیں۔ یہ ایپ مقامی محفوظ مواد کو خفیہ نہیں کرتی۔|Mehfooz karne par isi device mein sirf dikhaya gaya matn rehta hai, aawaz nahin. Yeh app local mehfooz mawaad ko encrypt nahin karti.
Connection code expired or incorrect. Get a new code from the backend terminal.|رابطہ کوڈ غلط ہے یا اس کی مدت ختم ہو گئی ہے۔ بیک اینڈ ٹرمینل سے نیا کوڈ حاصل کریں۔|Pairing code ghalat hai ya us ki muddat khatam ho gayi hai. Backend terminal se naya code hasil karein.
Your speech connection expired. Connect again with a new code.|گفتگو کے رابطے کی مدت ختم ہو گئی۔ نئے کوڈ سے دوبارہ جوڑیں۔|Guftagu ke raabte ki muddat khatam ho gayi. Naye code se dobara jorein.
Cannot reach the speech server. Check that the backend is running.|گفتگو کے سرور سے رابطہ نہیں ہو رہا۔ چیک کریں کہ بیک اینڈ چل رہا ہے۔|Guftagu ke server se raabta nahin ho raha. Check karein ke backend chal raha hai.
Connect to the speech server before starting the microphone.|مائیک شروع کرنے سے پہلے گفتگو کے سرور سے رابطہ کریں۔|Mic shuru karne se pehle guftagu ke server se raabta karein.
The speech server returned an unexpected result. Your completed captions are unchanged.|گفتگو کے سرور سے غیر متوقع نتیجہ ملا۔ آپ کا مکمل متن محفوظ ہے۔|Guftagu ke server se ghair mutawaqqa nateeja mila. Aap ka mukammal matn mehfooz hai.
One speech segment could not be translated. Completed captions are unchanged; please repeat that part.|گفتگو کے ایک حصے کا ترجمہ نہیں ہو سکا۔ مکمل متن موجود ہے؛ براہِ کرم وہ حصہ دوبارہ بولیں۔|Guftagu ke aik hisse ka tarjuma nahin ho saka. Mukammal matn maujood hai; barah-e-karam woh hissa dobara bolein.
Microphone capture was interrupted. Check permissions and tap the microphone to retry.|مائیک کی ریکارڈنگ رک گئی۔ اجازتیں چیک کریں اور دوبارہ کوشش کے لیے مائیک دبائیں۔|Mic ki recording ruk gayi. Ijazatein check karein aur dobara koshish ke liye mic dabayen.
Live audio needs a new Hum Ahang development build. Expo Go does not include this recorder.|براہِ راست آواز کے لیے ہم آہنگ کا نیا ترقیاتی نسخہ درکار ہے۔ ایکسپو گو میں یہ ریکارڈر شامل نہیں۔|Live aawaz ke liye Hum Ahang ka naya development build darkar hai. Expo Go mein yeh recorder shamil nahin.
Open this page on localhost or HTTPS to use the microphone.|مائیک استعمال کرنے کے لیے یہ صفحہ لوکل ہوسٹ یا محفوظ ایچ ٹی ٹی پی ایس پتے پر کھولیں۔|Mic istemal karne ke liye yeh safha localhost ya HTTPS pate par kholein.
Microphone permission was denied. Allow it in device or browser settings and retry.|مائیک کی اجازت نہیں دی گئی۔ آلے یا براؤزر کی ترتیبات میں اجازت دیں اور دوبارہ کوشش کریں۔|Mic ki ijazat nahin di gayi. Device ya browser ki tarteebat mein ijazat dein aur dobara koshish karein.
No microphone was found. Connect a microphone and retry.|مائیک نہیں ملا۔ مائیک جوڑیں اور دوبارہ کوشش کریں۔|Mic nahin mila. Mic jorein aur dobara koshish karein.
This microphone could not provide a supported audio format.|یہ مائیک قابلِ قبول صوتی فارمیٹ نہیں دے سکا۔|Yeh mic qabil-e-qabool audio format nahin de saka.
Speech service could not start. Check backend provider configuration and try again.|گفتگو کی سروس شروع نہیں ہو سکی۔ بیک اینڈ کی سروس ترتیبات چیک کر کے دوبارہ کوشش کریں۔|Guftagu ki service shuru nahin ho saki. Backend ki service tarteebat check kar ke dobara koshish karein.
Speech connection was interrupted. Completed captions are unchanged. Tap the microphone to retry.|گفتگو کا رابطہ ٹوٹ گیا۔ مکمل متن موجود ہے۔ دوبارہ کوشش کے لیے مائیک دبائیں۔|Guftagu ka raabta toot gaya. Mukammal matn maujood hai. Dobara koshish ke liye mic dabayen.
The listening session reached its limit. Tap the microphone to continue.|سننے کی نشست اپنی حد تک پہنچ گئی۔ جاری رکھنے کے لیے مائیک دبائیں۔|Sunne ki nashist apni hadd tak pohanch gayi. Jaari rakhne ke liye mic dabayen.
The speech server is busy. Wait a moment and try again.|گفتگو کا سرور مصروف ہے۔ کچھ دیر بعد دوبارہ کوشش کریں۔|Guftagu ka server masroof hai. Kuch dair baad dobara koshish karein.
Microphone or speech connection took too long to start. Please retry.|مائیک یا گفتگو کا رابطہ شروع ہونے میں زیادہ وقت لگا۔ دوبارہ کوشش کریں۔|Mic ya guftagu ka raabta shuru hone mein zyada waqt laga. Dobara koshish karein.
Finishing speech took too long. Completed captions are unchanged.|گفتگو مکمل ہونے میں زیادہ وقت لگا۔ مکمل متن موجود ہے۔|Guftagu mukammal hone mein zyada waqt laga. Mukammal matn maujood hai.
`.trim().split('\n').map(line => line.split('|'));
for (const [en, ur, roman] of [...translationRows, ...captionRows, ...captionInputRows, ...navigationGestureRows, ...captionSimpleRows, ...photoCaptureRows, ...visionRows]) {
  catalogs.ur.set(normalize(en), ur);
  catalogs.roman.set(normalize(en), roman);
}
// Emergency and QR copy remain independently usable in safety-critical controllers.
function register(en: Record<string, any>, ur: Record<string, any>, roman: Record<string, any>) {
  for (const key of Object.keys(en)) {
    if (typeof en[key] === 'string') {
      catalogs.ur.set(normalize(en[key]), ur[key]);
      catalogs.roman.set(normalize(en[key]), roman[key]);
    } else register(en[key], ur[key], roman[key]);
  }
}
for (const getCopy of [getEmergencyCopy, getContactQrCopy]) register(getCopy('English'), getCopy('اردو'), getCopy('Roman Urdu'));

export function translate(language: string, source: string, params: Record<string, string | number> = {}): string {
  const catalog = language === 'Roman Urdu' ? catalogs.roman : localeDirection(language) === 'rtl' ? catalogs.ur : null;
  const translated = catalog?.get(normalize(source));
  const result = translated ? (source.match(/^\s*/)?.[0] ?? '') + translated + (source.match(/\s*$/)?.[0] ?? '') : source;
  return result.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(params, key) ? String(params[key]) : token);
}
export function uiText(language: string, value: string, verbatim = false): string {
  return verbatim ? value : translate(language, value);
}
export function hasTranslation(source: string): boolean {
  return catalogs.ur.has(normalize(source)) && catalogs.roman.has(normalize(source));
}
