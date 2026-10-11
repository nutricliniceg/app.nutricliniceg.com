// P32-DESIGN-2: adds the newsletter landing-page copy to both dictionaries.
// Written as UTF-8 by the Write tool (never piped through PowerShell) precisely
// because the P32-DESIGN mojibake regression came from that round trip.
//
// Values mirror the hardcoded COPY constants that used to live in
// app/newsletter/{confirm,unsubscribe}/[token]/page.tsx.
const fs = require('node:fs');

const ADD = {
  'messages/ar.json': {
    confirmedTitle: 'تم تأكيد الاشتراك',
    confirmedBody: 'شكرًا — ستصلك نشرتنا.',
    confirmFailedTitle: 'الرابط غير صالح أو منتهٍ',
    confirmFailedBody: 'رابط التأكيد غير صالح أو مستخدم أو أقدم من 48 ساعة.',
    unsubscribedTitle: 'تم إلغاء الاشتراك',
    unsubscribedBody: 'لن تصلك رسائلنا بعد الآن.',
  },
  'messages/en.json': {
    confirmedTitle: 'Subscription confirmed',
    confirmedBody: 'Thank you — you will receive our newsletter.',
    confirmFailedTitle: 'Link invalid or expired',
    confirmFailedBody:
      'This confirmation link is invalid, already used, or older than 48 hours.',
    unsubscribedTitle: 'Unsubscribed',
    unsubscribedBody: 'You will not receive our emails anymore.',
  },
};

for (const [file, keys] of Object.entries(ADD)) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!json.newsletter) throw new Error(`${file}: newsletter namespace missing`);
  for (const [k, v] of Object.entries(keys)) {
    if (json.newsletter[k] !== undefined) {
      console.log(`  skip (already present) ${file} newsletter.${k}`);
      continue;
    }
    json.newsletter[k] = v;
    console.log(`  + ${file} newsletter.${k}`);
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}
console.log('done');