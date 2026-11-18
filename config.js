// إعدادات التطبيق — رابط قراءة الشيت (Apps Script Web App)
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxQ4AkuKnp8b6xK0Oy4Wft8PZU9WEybQyu5yCnumuxBnY60fYmjTXAUkX-ge9uZir7uKw/exec',              // بينحط بعد نشر Apps Script
  REFRESH_MINUTES: 60,      // تحديث الأسعار بالخلفية كل ساعة
  IDLE_SECONDS: 90,         // الكاميرا بتوقف لحالها بعد هالمدة بدون استخدام
  SAME_CODE_SECONDS: 2.5    // ما بنعيد نفس الصنف إذا ضل قدام الكاميرا
};
