// إعدادات التطبيق — رابط قراءة الشيت (Apps Script Web App)
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxQ4AkuKnp8b6xK0Oy4Wft8PZU9WEybQyu5yCnumuxBnY60fYmjTXAUkX-ge9uZir7uKw/exec',              // بينحط بعد نشر Apps Script
  MIN_REFETCH_SECONDS: 30,  // أقل مدة بين تحديثين (التحديث مع كل فتح وكل 3 دقايق)
  IDLE_SECONDS: 90,         // الكاميرا بتوقف لحالها بعد هالمدة بدون استخدام
  SAME_CODE_SECONDS: 2.5    // ما بنعيد نفس الصنف إذا ضل قدام الكاميرا
};
