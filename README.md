# DREAM HOUSE PRO 3.0 — NO SUPABASE

نسخة مستقلة بالكامل بدون Supabase، مبنية على Node.js + Express + SQLite.

## الدخول الافتراضي
- Username: `admin`
- Password: `112203`

يمكن تغييرهما قبل النشر باستخدام متغيرات البيئة `ADMIN_USER` و `ADMIN_PASSWORD`.

## التشغيل المحلي
1. Node.js 18+.
2. `npm install`
3. `npm start`
4. افتح `http://localhost:3000`

## للنشر على استضافة
اختَر استضافة تدعم **Node.js long-running process** ويفضل أن توفر **Persistent Disk/Volume** لأن قاعدة SQLite وملفات الصور تحتاج تخزيناً دائماً.

المشروع يستمع على `0.0.0.0` ويقرأ المنفذ من `PORT`.

## البيانات
- `data/dream_house.db` قاعدة البيانات.
- `public/uploads/` صور العقارات.
- يفضل أخذ نسخة احتياطية من الاثنين.

## مميزات النسخة
- واجهة فاتحة ومبهجة Mobile-first مع Glass/3D effects.
- تسجيل دخول.
- عقارات + عملاء + مطابقة طلب العميل.
- بحث ذكي: اسم/منطقة/نوع، وإذا كتبت رقماً كبيراً مثل `3,000,000` في البحث السريع يعتبره سقفاً للسعر.
- فلترة السعر والمساحة والغرف والحالة.
- تقارير PDF/Print تحمل DREAM HOUSE و Engineer Ahmed Galal و 01035032020 ورقم بيان فريد.
- سجل تدقيق داخلي للعمليات الأساسية.
- رفع صور آمن بامتداد صور معروف وحجم أقصى 8MB.
- Health check: `/api/health`.


## فحص سريع قبل النشر
- `node --check server.js` يجب أن ينجح بدون أخطاء.
- بعد `npm install` شغّل `npm start` ثم افتح `/api/health` ويجب أن يعيد `ok: true`.
- اختبر تسجيل الدخول، إضافة عقار، رفع صورة، البحث، الفلترة، واستخراج PDF قبل نشر الرابط للموظفين.

## إعدادات الإنتاج
اضبط `SESSION_SECRET` بقيمة عشوائية طويلة، ويفضل تغيير `ADMIN_PASSWORD`. ويمكن تحديد مكان التخزين الدائم عبر `DATA_DIR` و `UPLOAD_DIR`.

### Render
اربط Persistent Disk بمجلد مثل `/var/data` ثم اضبط:
- `DATA_DIR=/var/data/data`
- `UPLOAD_DIR=/var/data/uploads`
- Health Check Path: `/api/health`

### Railway
أضف Volume على مسار `/data` ثم اضبط:
- `DATA_DIR=/data/db`
- `UPLOAD_DIR=/data/uploads`
- Health check: `/api/health`

> مهم: SQLite + ملفات الصور تحتاج تخزيناً دائماً. لا تنشر هذه النسخة على استضافة يكون نظام الملفات فيها مؤقتاً بدون Volume/Persistent Disk.
