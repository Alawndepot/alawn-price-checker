// إعدادات تطبيق الصحي — رابط قراءة الشيتات (Apps Script Web App)
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwuNnbpLho9EEG1KXEmBXT_laNahMTx8nqopREMKd84Ntr1cWELcV-Khqiz4hDaIXfQiA/exec',
  MIN_REFETCH_SECONDS: 30,   // أقل مدة بين تحديثين (التحديث مع كل فتح وكل 3 دقايق)
  IDLE_SECONDS: 90,          // الكاميرا بتوقف لحالها بعد هالمدة بدون استخدام
  SAME_CODE_SECONDS: 2.5,    // ما بنعيد نفس الصنف إذا ضل قدام الكاميرا
  LOW_MARGIN_PCT: 20         // ربح أقل من هيك (على التكلفة) بينعلّم «ربح قليل»
};
