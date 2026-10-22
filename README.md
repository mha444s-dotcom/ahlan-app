# أهلًا | Ahlan

دليل عربي لاستكشاف مصر وخدمات الإقامة والزيارة، مع تجربة «اكتشف مصر» المدمجة ومعرض حضارة يضم 170 معلمًا و11 عصرًا وتسعة تصنيفات. تطبيق ويب ثابت يدعم RTL والتثبيت كتطبيق PWA.

- الموقع الأساسي: https://ahlan-app.pages.dev/
- الرابط الاحتياطي المؤقت: https://mha444s-dotcom.github.io/ahlan-app/
- المستودع: https://github.com/mha444s-dotcom/ahlan-app
- النشر الأساسي: Cloudflare Pages عبر Git Integration من main؛ تُنشر **release/ahlan/** فقط.
- GitHub Actions يبني ويختبر وينشر النسخة الاحتياطية الحالية بصورة مستقلة.

## التشغيل محليًا

يلزم Node.js 24 وGit. لا يوجد خادم حسابات أو حجز خلفي.

```powershell
npm ci --no-audit --no-fund
node serve-local.cjs
```

افتح http://127.0.0.1:4173/ .

## الاختبار والبناء

```powershell
npm run check:publish
npm run test:ci
npm run build
npm run preview
```

المعاينة الإنتاجية: http://127.0.0.1:4177/ . المصدر القابل للتعديل هو **dist/**، أما **release/ahlan/** فهو ناتج مصغّر لا يُرفع إلى Git؛ ينشئه Actions من المصدر. عند تغيير المصدر ووجود إصدار محلي سابق، استخدم `npm run build:update`؛ يحتفظ بالإصدار السابق داخل release/ دون حذفه.

`npm run test:ci` مستقل عن النسخ الاحتياطية المحلية. الاختبار التاريخي الإضافي `tests/discover-package.cjs` يحتاج لقطات قديمة محفوظة محليًا؛ لا يدخل CI. اختبار Chrome الفعلي (تثبيت Chrome مطلوب):

```powershell
node tests/browser-pages.cjs --local --root release/ahlan --base-path /ahlan-app/
```

## التحديث والنشر

بعد اكتمال التعديل، وليس عند كل حفظ:

```powershell
npm run ship -- --message "Describe the completed change"
```

أو من VS Code: **Terminal → Run Task → Ahlan: Test, build, commit and deploy**. تستخدم الدورة اتصال Git الآمن الموجود؛ لا تضع رمز دخول في الملفات. تفحص الملفات، تختبر، تبني، تختبر Chrome من جذر النطاق، تنشئ Commit على main وتنفّذ Push إلى ahlan-app فقط، ثم تنتظر فحص Cloudflare الرسمي في GitHub وتطابق Commit الحي في deployment.json على الرابط الأساسي. لا تحتاج متابعة النشر إلى Cloudflare API Token جديد. يتوقف الأمر عند أي فشل ولا ينفّذ Force Push. يجب إكمال العمل قبل تشغيله، وعدم تعديله بالتوازي أثناء الفحص.

Cloudflare ينشر الإنتاج تلقائيًا من main؛ معاينات الفروع الأخرى معطلة حاليًا. GitHub Actions يفحص طلبات السحب دون نشرها، ويحدّث رابط Pages الاحتياطي من main أو تشغيل workflow يدوي عليه. صلاحيات GitHub Pages وOIDC محصورة في مهمة النشر الاحتياطية. لا يلزم إضافة أي مفتاح Cloudflare أو سر جديد للمستودع.

إعداد Cloudflare: أمر البناء `npm ci --ignore-scripts --no-audit --no-fund && npm run build:cloudflare`، ومجلد المخرجات `release/ahlan`، ومجلد المشروع `/`، و`NODE_VERSION=24` و`SKIP_DEPENDENCY_INSTALL=true`. يشغّل build:cloudflare فحص المصدر والاختبارات ثم البناء وختم Commit. تم التحقق من عمل esbuild مع --ignore-scripts باستخدام الاعتماد المقفل.

## بنية المشروع

| المسار | الوظيفة |
|---|---|
| dist/ | مصدر التطبيق والبيانات والصور الأصلية والأيقونات |
| dist/discover-egypt/ | صفحة اكتشف مصر، مكوّن أصلي معزول داخل Shadow DOM؛ بدون iframe |
| maintenance/production/ | البناء والتحقق وتحسينات الصور دون فقد |
| maintenance/github/ | فحص أمان المصدر ودورة التسليم والتحقق من Pages الاحتياطي |
| maintenance/cloudflare/ | متابعة نشر Cloudflare من فحوص المستودع والتحقق من Commit الحي |
| maintenance/sources/ | المصدر التصميمي المعتمد مضغوطًا، مع بيانات تحقق |
| design/approved-icon-system/ | مصادر الأيقونات اللازمة لإعادة التوليد |
| design-references/ | المراجع البصرية المعتمدة |
| tests/ | اختبارات المنطق وPWA والصور والمتصفح |
| .github/workflows/pages.yml | فحص وبناء واختبار ونشر Pages |

لا تُنشر الاختبارات والمراجع أو المصادر المضغوطة مع التطبيق. النسخ الاحتياطية وملفات المتصفح وسجلات نقل الجهاز وبيانات الاستضافة المحلية مستبعدة من Git، ومحفوظة محليًا. أصول صور الخدمات الـ14 باقية في المصدر؛ يستخدم العرض نسخ JPEG الأصلية المحسنة كما كان. WebP للأيقونات ورسومات Discover هو Lossless بمطابقة البكسلات.

## المسارات وPWA والبيانات

التنقل يستخدم Hash Routing مثل `#/home` و`#/journey?tab=explore`. الموارد وManifest وService Worker تستخدم مسارات نسبية؛ تعمل من `/` على Cloudflare ومن `/ahlan-app/` على GitHub Pages. لا يلزم إعادة كتابة روابط الصفحات على الخادم.

يمكن تثبيت التطبيق عبر المتصفح الداعم وعلى iPhone عبر «إضافة إلى الشاشة الرئيسية». التخزين دون إنترنت يغطي هيكل التطبيق والموارد المحلية المخزنة ضمن حدود الكاش؛ الصور والخدمات الخارجية تحتاج الإنترنت. تحديثات العامل تنتظر إغلاق الصفحات القديمة لتجنب خلط الإصدارات. يعالج كاش HTML إعادة توجيه Cloudflare لمسارات .html قبل استخدامها لإعادة التحميل، مع الحفاظ على نفس بايتات المحتوى.

المفضلة والخطة والملف والتذكيرات محفوظة محليًا في المتصفح، وليست حسابات سحابية. بيانات localhost أو GitHub Pages أو متصفح آخر لا تنتقل تلقائيًا إلى نطاق Cloudflare. تظل بيانات الرابط القديم محفوظة على ذلك الرابط؛ المتصفح يعزل التخزين بحسب النطاق. لا تُرفع بيانات استخدام المستخدم إلى GitHub. المصادر وتراخيص الصور موجودة داخل صفحة اكتشف مصر. أصول الطرف الثالث تظل خاضعة لتراخيصها.

## التراجع

لإلغاء تعديل منشور استخدم `git revert <commit>` ثم اختبر وادفع Commit التراجع عبر أمر ship؛ تعيد Cloudflare نشر الإصدار منه وتحدّث Actions الوجهة الاحتياطية. لا تستخدم reset/force push. التاريخ المحلي السابق محفوظ في _backups/ خارج المستودع الجديد. احتفظ به وبنقاط الرجوع؛ لا ترفعهما.
