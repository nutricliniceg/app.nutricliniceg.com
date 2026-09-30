// P18: minimal bilingual strings for the standalone print surface.
// Print pages live outside [locale] routing (share links open logged-out),
// so they cannot use next-intl hooks; dashboard/settings UI strings stay in
// messages/*.json. Arabic is the default (D-03).

export type PrintLocale = 'ar' | 'en';

const STRINGS = {
  ar: {
    patient: 'المريض',
    targets: 'المستهدف اليومي',
    calories: 'السعرات',
    protein: 'بروتين',
    carbs: 'كربوهيدرات',
    fats: 'دهون',
    day: 'اليوم',
    meal: 'الوجبة',
    item: 'الصنف',
    grams: 'الجرام',
    sets: 'مجموعات',
    reps: 'تكرارات',
    rest: 'راحة (ث)',
    notes: 'ملاحظات',
    video: 'شرح',
    kcalUnit: 'سعرة',
    gUnit: 'جم',
    medicalNote: 'هذه الخطة استرشادية — راجع طبيبك قبل أي تغيير.',
    pdfHint: 'لحفظ PDF: اضغط طباعة ثم اختر "حفظ كـ PDF" من الوجهة.',
    print: 'طباعة',
    platformFooter: 'NutriClinicEG — nutricliniceg.com',
  },
  en: {
    patient: 'Patient',
    targets: 'Daily targets',
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fats: 'Fats',
    day: 'Day',
    meal: 'Meal',
    item: 'Item',
    grams: 'Grams',
    sets: 'Sets',
    reps: 'Reps',
    rest: 'Rest (s)',
    notes: 'Notes',
    video: 'Tutorial',
    kcalUnit: 'kcal',
    gUnit: 'g',
    medicalNote: 'This plan is advisory — consult your doctor before any change.',
    pdfHint: 'To save a PDF: press Print, then choose "Save as PDF" as the destination.',
    print: 'Print',
    platformFooter: 'NutriClinicEG — nutricliniceg.com',
  },
} as const;

export type PrintCopy = { [K in keyof (typeof STRINGS)['ar']]: string };

export function printStrings(locale: string | undefined): PrintCopy {
  return (locale === 'en' ? STRINGS.en : STRINGS.ar) as PrintCopy;
}

export function printDir(locale: string | undefined): 'rtl' | 'ltr' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

const RECEIPT = {
  ar: { plan: 'الخطة', amount: 'المبلغ', method: 'الطريقة', reference: 'المرجع', status: 'الحالة', print: 'طباعة' },
  en: { plan: 'Plan', amount: 'Amount', method: 'Method', reference: 'Reference', status: 'Status', print: 'Print' },
} as const;

export function receiptStrings(locale: string | undefined): { plan: string; amount: string; method: string; reference: string; status: string; print: string } {
  return locale === 'en' ? { ...RECEIPT.en } : { ...RECEIPT.ar };
}
