export const captionInputRows = `
Speaking language|بولنے کی زبان|Bolne ki zabaan
English input|انگریزی میں بولیں|English mein bolein
Urdu input|اردو میں بولیں|Urdu mein bolein
English input selected.|بولنے کے لیے انگریزی منتخب ہے۔|Bolne ke liye English muntakhib hai.
Urdu input selected.|بولنے کے لیے اردو منتخب ہے۔|Bolne ke liye Urdu muntakhib hai.
Input language swipe area|بولنے کی زبان بدلنے کے لیے سوائپ کی جگہ|Bolne ki zabaan badalne ke liye swipe ki jagah
Stop recording and wait for processing to change input language.|بولنے کی زبان بدلنے کے لیے ریکارڈنگ بند کریں اور متن تیار ہونے کا انتظار کریں۔|Bolne ki zabaan badalne ke liye recording band karein aur matn tayyar hone ka intezar karein.
Only here: swipe left for English, right for Urdu.|صرف یہاں: انگریزی کے لیے بائیں، اردو کے لیے دائیں سوائپ کریں۔|Sirf yahan: English ke liye baayein, Urdu ke liye daayein swipe karein.
Gestures are off. Tap a language above.|اشارے بند ہیں۔ اوپر زبان کے بٹن کو دبائیں۔|Ishare band hain. Oopar zabaan ke button ko dabayen.
Input changes recognition only. Output tabs below stay independent.|یہ صرف بولی جانے والی زبان بدلتا ہے۔ نیچے ترجمے کے بٹن الگ ہیں۔|Yeh sirf boli jane wali zabaan badalta hai. Neeche tarjume ke button alag hain.
Announcing selected language…|منتخب زبان بتائی جا رہی ہے…|Muntakhib zabaan batayi ja rahi hai…
Stop voice indication|زبان کی صوتی اطلاع بند کریں|Zabaan ki sauti ittila band karein
Stop voice|آواز بند کریں|Aawaz band karein
Could not stop voice indication. Tap Stop voice again before recording.|صوتی اطلاع بند نہیں ہو سکی۔ ریکارڈنگ سے پہلے دوبارہ آواز بند کریں دبائیں۔|Sauti ittila band nahin ho saki. Recording se pehle dobara Aawaz band karein dabayen.
Changes the displayed translation, not the selected speaking language.|یہ دکھائے جانے والا ترجمہ بدلتا ہے، بولنے کے لیے منتخب زبان نہیں۔|Yeh dikhaye jane wala tarjuma badalta hai, bolne ke liye muntakhib zabaan nahin.
Language selected. Voice indication is unavailable; check device volume and voices.|زبان منتخب ہے۔ صوتی اطلاع دستیاب نہیں؛ آلے کی آواز اور صوتی زبانیں چیک کریں۔|Zabaan muntakhib hai. Sauti ittila dastiyab nahin; device ki aawaz aur sauti zabanein check karein.
Urdu input · Urdu and English outputs|بولنے کی زبان اردو · اردو اور انگریزی ترجمے|Bolne ki zabaan Urdu · Urdu aur English tarjume
English input · Urdu and English outputs|بولنے کی زبان انگریزی · اردو اور انگریزی ترجمے|Bolne ki zabaan English · Urdu aur English tarjume
Speech recognition returned an unusable segment. Completed captions are unchanged; please repeat that part.|آواز کی پہچان سے گفتگو کا ایک حصہ قابلِ استعمال نہیں ملا۔ مکمل متن موجود ہے؛ براہِ کرم وہ حصہ دوبارہ بولیں۔|Aawaz ki pehchan se guftagu ka aik hissa qabil-e-istemal nahin mila. Mukammal matn maujood hai; barah-e-karam woh hissa dobara bolein.
The translation service could not finish one segment. Completed captions are unchanged; please repeat that part.|ترجمے کی سروس گفتگو کا ایک حصہ مکمل نہیں کر سکی۔ مکمل متن موجود ہے؛ براہِ کرم وہ حصہ دوبارہ بولیں۔|Tarjume ki service guftagu ka aik hissa mukammal nahin kar saki. Mukammal matn maujood hai; barah-e-karam woh hissa dobara bolein.
One translation failed the language or number safety checks. Completed captions are unchanged; please repeat that part.|ایک ترجمہ زبان یا اعداد کی حفاظتی جانچ میں ناکام ہوا۔ مکمل متن موجود ہے؛ براہِ کرم وہ حصہ دوبارہ بولیں۔|Aik tarjuma zabaan ya adaad ki hifazati jaanch mein nakaam hua. Mukammal matn maujood hai; barah-e-karam woh hissa dobara bolein.
`.trim().split('\n').map(line => line.split('|'));
