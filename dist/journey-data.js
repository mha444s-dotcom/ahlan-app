'use strict';

// Navigation references only: all service details remain in appContent.
// Group indices deliberately preserve government subgroups and existing URLs.
window.ahlanJourneys = {
  explore: {
    title: {ar:'اكتشف مصر', en:'Explore Egypt'},
    description: {ar:'استكشف الوجهات السياحية والثقافة والتجارب المميزة في مصر.', en:'Explore Egypt’s destinations, culture and memorable experiences.'},
  },
  outside: {
    title: {ar:'أنا خارج مصر', en:"I'm Outside Egypt"},
    description: {ar:'كل ما تحتاج معرفته وتجهيزه قبل القدوم إلى مصر، مهما كان سبب زيارتك.', en:'What to know and prepare before coming to Egypt, whatever the purpose of your visit.'},
    groups: [
      {title:{ar:'التأشيرات ومتطلبات الدخول',en:'Visas and entry preparation'}, icon:'procedures', refs:[[0,0]]},
      {title:{ar:'المستندات والترجمة والتوثيق',en:'Documents, translation and certification'}, icon:'document', refs:[[2,2],[10,2],[0,3]]},
      {title:{ar:'التنقل والتخطيط للوصول',en:'Transport and arrival planning'}, icon:'transport', refs:[[5,1],[5,3]], gap:'arrival'},
      {title:{ar:'الدراسة والقبول الجامعي',en:'Study and university admission'}, icon:'education', refs:[[2,0],[2,1],[2,2]]},
      {title:{ar:'الاستعداد للعمل',en:'Preparing for work'}, icon:'work', refs:[[3,0],[3,2],[3,3],[0,2]]},
      {title:{ar:'العلاج والسياحة العلاجية',en:'Healthcare and medical travel'}, icon:'health', refs:[[4,0],[4,3]]},
      {title:{ar:'العمل والاستثمار',en:'Business and investment'}, icon:'office', refs:[[3,1],[0,3]], gap:'investment'},
      {title:{ar:'البحث عن سكن قبل الوصول',en:'Finding housing before arrival'}, icon:'housing', refs:[[1,0],[1,1]]},
      {title:{ar:'التجهيزات والمعلومات قبل السفر',en:'Travel preparation and practical information'}, icon:'plan', refs:[[9,2],[10,1],[13,0]], gap:'booking'},
    ],
  },
  inside: {
    title: {ar:'أنا في مصر',en:"I'm in Egypt"},
    description: {ar:'اكتشف الخدمات والمعلومات التي تسهّل حياتك أثناء وجودك في مصر، سواء كنت زائرًا أو مقيمًا.', en:'Find services and information for life in Egypt, whether you are visiting or living here.'},
    groups: [
      {title:{ar:'الإجراءات الحكومية والإقامة والعمل',en:'Government procedures, residence and work permits'},icon:'procedures',refs:[[0,0],[0,1],[0,2],[0,3]]},
      {title:{ar:'السكن والإيجارات',en:'Housing and rentals'},icon:'housing',refs:[[1,0],[1,1],[1,2]]},
      {title:{ar:'المواصلات والتنقل',en:'Transport and getting around'},icon:'transport',refs:[[5,0],[5,1],[5,2],[5,3]]},
      {title:{ar:'البنوك والمدفوعات',en:'Banking and payments'},icon:'bank',refs:[[6,1]]},
      {title:{ar:'الاتصالات والإنترنت',en:'Mobile and internet'},icon:'phone',refs:[[6,0]]},
      {title:{ar:'الرعاية الصحية',en:'Healthcare'},icon:'health',refs:[[4,0],[4,1],[4,2],[4,3]]},
      {title:{ar:'التعليم والدراسة',en:'Education and study'},icon:'education',refs:[[2,0],[2,1],[2,2]]},
      {title:{ar:'العمل والأعمال',en:'Jobs and business'},icon:'work',refs:[[3,0],[3,1],[3,2],[3,3]]},
      {title:{ar:'التسوق والخدمات اليومية',en:'Shopping and daily services'},icon:'daily',refs:[[6,2],[6,3]]},
      {title:{ar:'المجتمع والتواصل',en:'Community and connections'},icon:'community',refs:[[7,0],[7,1],[7,2],[7,3]]},
      {title:{ar:'الخريطة والأماكن',en:'Map and places'},icon:'map',refs:[[8,0],[8,1]]},
      {title:{ar:'السياحة والتجارب',en:'Tourism and experiences'},icon:'tourism',refs:[[9,0],[9,1],[9,2]]},
      {title:{ar:'الترجمة واللغات',en:'Translation and languages'},icon:'translation',refs:[[10,0],[10,1],[10,2]]},
      {title:{ar:'المساعدة والطوارئ',en:'Assistance and emergencies'},icon:'emergency',refs:[[12,0],[12,1],[12,2],[12,3],[11,0],[11,1]]},
      {title:{ar:'ملفي والتذكيرات',en:'My profile and reminders'},icon:'profile',refs:[[13,0],[13,1]]},
    ],
  },
};
window.ahlanJourneyCopy = {
  help:{ar:'كيف يمكننا مساعدتك؟',en:'How can we help you?'},
  home:{ar:'الرئيسية',en:'Home'},
  empty:{ar:'لا توجد خدمات مطابقة. جرّب كلمة أخرى أو انتقل إلى قسم مختلف.',en:'No matching services. Try another keyword or choose another section.'},
  original:{ar:'روابط إلى المحتوى الحالي؛ التفاصيل الإرشادية تحتاج إلى تحقق رسمي قبل الاعتماد عليها.',en:'Links to the existing guide; procedural details require official verification before use.'},
  languageNote:{ar:'المحتوى الأصلي للأدلة متاح بالعربية. يمكن تغيير لغة أسماء الأقسام ووصفها وتنظيمها فقط حاليًا.',en:'Original guides are in Arabic. Language switching currently covers the journey names, descriptions and organisation only.'},
  search:{ar:'ابحث عن خدمة أو مستند أو مكان',en:'Search services, documents or places (original content: Arabic)'},
  arrival:{ar:'المتاح حاليًا يشمل التنقل والطيران الداخلي. إرشادات الطيران الدولي والوصول التفصيلية تحتاج إلى استكمال موثّق.',en:'Current content covers local transport and domestic flights. International travel and arrival guidance need verified content.'},
  investment:{ar:'توجد إشارات إلى هيئة الاستثمار؛ خطوات تأسيس الأعمال التفصيلية تحتاج إلى استكمال موثّق.',en:'The guide mentions the investment authority; detailed business formation procedures need verified content.'},
  booking:{ar:'هذه معلومات للتجهيز فقط؛ لا توجد حجوزات أو مدفوعات داخل التطبيق.',en:'Preparation information only; in-app booking and payments are unavailable.'},
};
