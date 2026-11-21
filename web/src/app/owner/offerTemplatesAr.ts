import type { OfferTemplate } from "./offerTemplates";

/**
 * Arabic versions of the Offers message templates, for venues whose screens are in Arabic. Same ids, same {keys},
 * same house rules as offerTemplates.ts (no exclamation marks, no pressure, nothing stated as fact, 200 characters or
 * fewer once filled). Worded for a visit, not only a meal, so they suit salons and spas too.
 * Checked by tests/offerTemplatesAr.test.ts.
 */
type Ar = { title: string; when: string; text: string; fields: Record<string, { label: string; example: string }> };

export const OFFER_TEMPLATES_AR: Record<string, Ar> = {
  "todays-update": {
    title: "تحديث اليوم",
    when: "رسالة يومية قصيرة. ضع عروضك مكان الأمثلة.",
    text: "تحديث من {from}: مكافأة اليوم {reward}. وعرض اليوم {bonus}.",
    fields: { from: { label: "من", example: "الإدارة" }, reward: { label: "مكافأة اليوم", example: "قناع شعر مجاني مع أي قصة" }, bonus: { label: "عرض اليوم", example: "ختم إضافي حتى نهاية اليوم" } },
  },
  "weekend-invitation": {
    title: "دعوة نهاية الأسبوع",
    when: "قبل نهاية الأسبوع بيوم أو يومين لدعوة الضيوف.",
    text: "زورونا {when}. {detail} يسعدنا استقبالكم.",
    fields: { when: { label: "أي يوم", example: "هذا الجمعة" }, detail: { label: "سطر عن الزيارة", example: "وقت هادئ وخدمة على راحتكم." } },
  },
  "new-on-the-menu": {
    title: "جديد في الخدمات",
    when: "عند إضافة خدمة أو باقة جديدة وتحب أن يعرف عملاؤك الدائمون أولاً.",
    text: "جديد لدينا: {dish}. {detail} نحب أن تكون من أوائل من يجربها.",
    fields: { dish: { label: "الخدمة أو الباقة", example: "باقة عناية جديدة" }, detail: { label: "سطر عنها", example: "اسأل فريقنا عنها في زيارتك القادمة." } },
  },
  "event-evening": {
    title: "مناسبة أو يوم خاص",
    when: "للإعلان عن يوم خاص أو مناسبة، مع اليوم والوقت.",
    text: "{event} يوم {date}. {detail} يسعدنا حضوركم.",
    fields: { event: { label: "المناسبة", example: "يوم عناية خاص" }, date: { label: "اليوم والوقت", example: "الخميس الساعة 8 مساءً" }, detail: { label: "سطر تفاصيل", example: "الحجز مرحب به." } },
  },
  "thank-you": {
    title: "شكراً لكم",
    when: "شكر هادئ لكل الضيوف بعد فترة مزدحمة أو في نهاية موسم.",
    text: "شكراً لأنك من ضيوفنا {period}. {note} نتطلع لاستقبالك مرة أخرى.",
    fields: { period: { label: "الفترة", example: "هذا الموسم" }, note: { label: "سطر شخصي", example: "كان من دواعي سرورنا خدمتك." } },
  },
  "we-miss-you": {
    title: "اشتقنا لك",
    when: "بعد فترة هدوء لدعوة الضيوف للعودة. تصل للجميع، فتبقى العبارة عامة.",
    text: "اشتقنا لرؤيتك. {note} متى ما كنت جاهزاً، يسعدنا استقبالك من جديد.",
    fields: { note: { label: "سطر منا", example: "بطاقتك مرحب بها دائماً عندنا." } },
  },
  "reward-ready": {
    title: "مكافأة جاهزة",
    when: "لتذكير الضيوف بأن هناك مكافأة. كل بطاقة تعرض أختامها، فتناسب الجميع.",
    text: "قد تكون هناك مكافأة في بطاقتك. {reward} لك في زيارتك القادمة. فقط اعرض بطاقتك على فريقنا.",
    fields: { reward: { label: "المكافأة", example: "قصة شعر مجانية" } },
  },
  "birthday-month": {
    title: "شهر الميلاد",
    when: "في بداية الشهر. البطاقات لا تحفظ تواريخ الميلاد، فالعبارة تدعو من يحتفل أن يخبرنا.",
    text: "إذا كان عيد ميلادك في {month}، يسعدنا أن نحتفل معك. {gift}",
    fields: { month: { label: "الشهر", example: "أكتوبر" }, gift: { label: "ما تقدمه", example: "أخبرنا عند الحجز وسنجهز لك لمسة خاصة." } },
  },
  "group-and-private-dining": {
    title: "حجز للمجموعات",
    when: "لدعوة مجموعة أكبر. استخدمها فقط إذا كنت تقبل حجوزات المجموعات.",
    text: "تخطط لـ{occasion}؟ يسعد فريقنا ترتيب الموعد لمجموعتك. {how}",
    fields: { occasion: { label: "المناسبة", example: "تجهيز عريس وأصدقائه" }, how: { label: "طريقة الاستفسار", example: "راسلنا بالتاريخ وعدد الأشخاص." } },
  },
  "seasonal-greeting": {
    title: "تهنئة بالمناسبة",
    when: "لرمضان أو العيد أو العيد الوطني أو السنة الجديدة. تهنئة فقط، بلا عروض.",
    text: "{greeting} من فريقنا جميعاً. {wish} نحن ممتنون لوجودك معنا.",
    fields: { greeting: { label: "التهنئة", example: "رمضان كريم" }, wish: { label: "أمنية", example: "نسأل الله أن يكون موسماً مليئاً بالصحة والسعادة مع أحبتك." } },
  },
  "quiet-midweek": {
    title: "وسط الأسبوع",
    when: "لدعوة الضيوف في يوم أهدأ، بلا أي ضغط.",
    text: "وسط الأسبوع بهدوء. أيام {day} وقت مريح لزيارتنا. {detail} يسعدنا رؤيتك.",
    fields: { day: { label: "اليوم أو الأيام", example: "الثلاثاء" }, detail: { label: "سطر تفاصيل", example: "الحجز مرحب به." } },
  },
};

/** The template in the screen's language: Arabic words when there are any, else the English one as it is. */
export function localTemplate(t: OfferTemplate, lang: "en" | "ar"): OfferTemplate {
  const ar = lang === "ar" ? OFFER_TEMPLATES_AR[t.id] : undefined;
  if (!ar) return t;
  return {
    ...t,
    title: ar.title,
    when: ar.when,
    text: ar.text,
    fields: t.fields.map((f) => ({ ...f, label: ar.fields[f.key]?.label ?? f.label, example: ar.fields[f.key]?.example ?? f.example })),
  };
}
