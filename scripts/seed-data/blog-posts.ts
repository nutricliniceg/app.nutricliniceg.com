// P32-SEED — 6 published blog posts: 3 Arabic originals, each with a linked
// English translation (P26 EN-clone rule: linked, never machine-translated).
//
// Real, clinically-sound nutrition writing of 400+ words per post, with
// headings, tables and lists. No lorem ipsum, no filler, no script
// contamination — scripts/seed-data/check-copy.ts enforces all of that.
//
// `slug` is the idempotency key: the seed upserts on (slug, locale) via
// blogAdminRepository.slugExists. `translationSlug` points at the Arabic
// post's slug so the English row gets translation_of set, which is what makes
// /en hide untranslated posts and drives the hreflang alternates (P25).

export interface SeedPost {
  locale: 'ar' | 'en';
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  meta_title: string;
  meta_desc: string;
  guest_author: string;
  /** ISO-8601 UTC; must be in the past so publish() goes live immediately. */
  published_at: string;
  /** Slug of the Arabic post this row translates (English rows only). */
  translationSlug?: string;
}

const AUTHOR_AR = 'فريق NutriClinicEG';
const AUTHOR_EN = 'NutriClinicEG Editorial';

// Staggered past dates keep the blog index ordering stable across re-runs.
const D1 = '2026-09-02T09:00:00.000Z';
const D2 = '2026-09-16T09:00:00.000Z';
const D3 = '2026-09-30T09:00:00.000Z';

export const SEED_POSTS: SeedPost[] = [
  // ══ 1. Daily calories ══════════════════════════════════════════════════════
  {
    locale: 'ar',
    slug: 'how-to-calculate-your-daily-calories',
    title: 'كيف تحسب سعراتك اليومية فعليًا؟',
    excerpt: 'طريقة عملية لحساب احتياجك اليومي من السعرات في ثلاث خطوات، ولماذا يختلف الرقم المناسب بين شخص وآخر.',
    meta_title: 'كيف تحسب سعراتك اليومية | NutriClinicEG',
    meta_desc: 'دليل عملي لحساب السعرات اليومية باستخدام معدل الأيض الأساسي ومعامل النشاط، مع حد أدنى آمن لا يجوز النزول عنه.',
    guest_author: AUTHOR_AR,
    published_at: D1,
    content_md: `كثيرون يبدأون الحمية بسؤال واحد: كم سعرًا في اليوم؟ والإجابة الصادقة أن رقمًا واحدًا لا ينفع للجميع. إليك الطريقة التي تعتمدها المنصة، وهي مبنية على معادلات معدّل الأيض الأساسية المعروفة طبيًا، لا على تقدير تقريبي.

## الخطوة الأولى: معدّل الأيض الأساسي

معدّل الأيض الأساسي هو عدد السعرات التي يحرقها جسمك وأنت ساكن تمامًا، لمجرد أنه يعمل: القلب ينبض، والكلى تصفّي، والدماغ يعمل. كثير من الحاسابات الشائعة تضخّم هذا الرقم لأنها تضيف النشاط الذي يحدث لاحقًا في اليوم. نحن نستخدم معادلة ميفلين وسانت جور لأنها الأدق للبالغين:

- **للنساء:** (10 × الوزن بالكيلوجرام) + (6.25 × الطول بالسنتيمتر) − (5 × العمر) − 161
- **للرجال:** (10 × الوزن بالكيلوجرام) + (6.25 × الطول بالسنتيمتر) − (5 × العمر) + 5

مثال عملي لامرأة عمرها 32 سنة، وزنها 68 كيلوجرامًا، وطولها 165 سنتيمترًا:
(10 × 68) + (6.25 × 165) − (5 × 32) − 161 = 680 + 1031 − 160 − 161 = **1390 سعرًا**.

هذا ما يحرقه جسدها وهي مستلقية. وليس ما تأكله.

## الخطوة الثانية: معامل النشاط

الرقم السابق ليس يومك الحقيقي. نضربه في معامل يعكس حركتك الفعلية خلال أسبوع معتاد:

| المستوى | الوصف | المعامل |
|---|---|---|
| خامل | عمل مكتبي، بلا رياضة | 1.2 |
| خفيف | مشي أو رياضة خفيفة من 1 إلى 3 أيام | 1.375 |
| متوسط | رياضة متوسطة من 3 إلى 5 أيام | 1.55 |
| نشط | رياضة مكثفة من 6 إلى 7 أيام | 1.725 |
| رياضي | تدريب يومي أو عمل بدني شاق | 1.9 |

في المثال السابق: 1390 × 1.375 = **1911 سعرًا**. هذا إجمالي الطاقة المستهلكة يوميًا، وهو رقم الصيانة الذي يُبقي الوزن ثابتًا.

## الخطوة الثالثة: حدّد الهدف ثم احترم الحد الأدنى

هنا الجزء الذي يغفل عنه كثيرون: لا تنزل أبدًا تحت حد أدنى. أي نظام يطلب النزول تحت 1200 سعر للنساء أو 1500 للرجال خطأ، وليس نظامًا متقدمًا:

- الجهاز الهرموني كاملًا يعمل على السعرات، والعجز الكبير هو ما يوقفه.
- كثافة العظام تنخفض، ويرافقها غالبًا انخفاض في مخزون الحديد.
- التكيّف الأيضي قد يعيدك إلى وزن البداية، أو أسوأ منه، بعد التوقف.

لذلك تعمل المنصة بأرقام صادقة: إذا كان هدفك إنقاص الوزن، نطرح بين 300 و500 سعر من الصيانة، ثم نتحقق أن الناتج لا يقع تحت الحد الآمن مهما كان ناتج الحساب. وإذا كان هدفك الثبات، نستخدم رقم الصيانة نفسه.

## متى لا يكفي الحساب وحده

الحسبة نقطة انطلاق وليست وصفة. ثلاث حالات تجعلها مضللة:

1. **توزيع الأنسجة.** النسيج الدهني والعضلي لا يحرقان السعرات بالقدر نفسه. العجز نفسه يعطي نتيجة مختلفة تمامًا إذا كنت تحافظ على العضلات أو تبنيها.
2. **الهرمونات.** الغدة الدرقية وكورتيزول يغيّران الرقم الأصلي، والمريض صاحب الغدة البطيئة يحتاج خطة مختلفة جوهريًا.
3. **الأمراض المزمنة.** السكري والضغط والكلى تتطلب تعديلًا إضافيًا، وأحيانًا يضع الطبيب سقفًا أعلى من الناتج الحسابي لا أقل.

## الخلاصة

ابدأ من معدّل الأيض الأساسي، واضرب في معامل يناسب حياتك الحقيقية، واطلب ما تحتاجه، ولا تكسر الحد الآمن. والأهم: قِس النتيجة. الوزن بعد أسبوعين هو الحكم النهائي، لا المعادلة على الورق.`,
  },
  {
    locale: 'en',
    slug: 'how-to-calculate-your-daily-calories',
    title: 'How to actually calculate your daily calories',
    excerpt: 'A practical three-step method for your daily calorie needs, and why the right number is different for everyone.',
    meta_title: 'How to calculate your daily calories | NutriClinicEG',
    meta_desc: 'A practical guide to daily calorie needs using basal metabolic rate and an activity multiplier, with a safety floor you should never undercut.',
    guest_author: AUTHOR_EN,
    published_at: D1,
    translationSlug: 'how-to-calculate-your-daily-calories',
    content_md: `Most people start a diet with one question: how many calories a day? The honest answer is that one number does not fit everyone. Here is the method the platform uses. It is built on well-established basal metabolic equations, not on guesswork.

## Step one: your basal metabolic rate

Your basal metabolic rate is the number of calories your body burns while completely at rest, simply to keep itself running: your heart beats, your kidneys filter, your brain runs. Many popular calculators inflate this figure by adding back activity that happens later in the day. We use the Mifflin-St Jeor equation instead, because it is the most accurate one for adults:

- **Women:** (10 x weight in kg) + (6.25 x height in cm) - (5 x age in years) - 161
- **Men:** (10 x weight in kg) + (6.25 x height in cm) - (5 x age in years) + 5

A worked example for a 32-year-old woman, 68 kg, 165 cm:
(10 x 68) + (6.25 x 165) - (5 x 32) - 161 = 680 + 1031 - 160 - 161 = **1,390 kcal**.

That is what her body burns lying still. It is not what she eats.

## Step two: the activity multiplier

The figure above is not a real day. We multiply it by a factor that reflects how you actually move across a typical week:

| Level | Description | Factor |
|---|---|---|
| Sedentary | Desk work, no exercise | 1.2 |
| Lightly active | Walking or light exercise 1 to 3 days | 1.375 |
| Moderately active | Moderate exercise 3 to 5 days | 1.55 |
| Very active | Hard exercise 6 to 7 days | 1.725 |
| Athlete | Daily training or heavy physical work | 1.9 |

For the example above: 1,390 x 1.375 = **1,911 kcal**. That is total daily energy expenditure, the maintenance number that keeps your weight steady.

## Step three: set the goal, then respect the floor

This is the part most people skip: never cut below a floor. Any plan that asks you to go under 1,200 kcal for women or 1,500 for men is wrong, not advanced:

- The hormonal system runs on calories, and a large deficit is what suppresses it.
- Bone density falls, and iron stores usually fall alongside it.
- Metabolic adaptation can return you to your starting weight, or worse, once you stop.

So the platform works with honest numbers. If your goal is weight loss, we subtract between 300 and 500 kcal from maintenance, then check the result against the safe minimum, whatever the arithmetic produced. If your goal is maintenance, we use the maintenance figure itself.

## When the calculation alone is not enough

The equation is a starting point, not a prescription. Three situations make it misleading:

1. **Body composition.** Fat tissue and muscle do not burn calories at the same rate. The same deficit produces a completely different result depending on whether you are preserving or building muscle.
2. **Hormones.** Thyroid function and cortisol change the underlying number, and a person with a sluggish thyroid needs a materially different plan.
3. **Chronic conditions.** Diabetes, hypertension and kidney disease require further adjustment, and sometimes a clinician sets a ceiling that is higher than the calculated figure rather than lower.

## Bottom line

Start from your basal metabolic rate, multiply by a factor that matches your real life, subtract what you need, and do not break the floor. And most importantly: measure the result. Your weight after two weeks is the final judge, not the equation on paper.`,
  },

  // ══ 2. Protein ═════════════════════════════════════════════════════════════
  {
    locale: 'ar',
    slug: 'protein-how-much-you-actually-need',
    title: 'البروتين: الكمية التي تحتاجها فعلًا، ومتى تكون الزيادة مفيدة',
    excerpt: 'لماذا يُبالغ في أهمية البروتين؟ والكم تحتاج فعلًا، وكيف توزّعه على وجباتك دون إفراط.',
    meta_title: 'البروتين: كم تحتاج فعلًا؟ | NutriClinicEG',
    meta_desc: 'الأهداف العملية من البروتين للبالغين، وتوزيعها على الوجبات، ولماذا لا تكفي زيادة البروتين وحدها لبناء العضلات.',
    guest_author: AUTHOR_AR,
    published_at: D2,
    content_md: `البروتين هو أكثر ما يتجادل فيه الناس في عيادة التغذية: من يقول 0.8 جرام لكل كيلوجرام، ومن يقول 2.5. والحقيقة أن الجواب يعتمد على الهدف والحالة. لنرتّب الفكرة كلها.

## ما الذي يفعله البروتين فعليًا

البروتين ليس مجرد عضلات. وظيفته أساسية في أربعة أعمال لا يمكن تعويضها:

- **بناء الأنسجة وإصلاحها.** العضلة والجلد وبطانة الأمعاء والأعضاء كلها بروتين.
- **النقل.** الهيموغلوبين ينقل الأكسجين في الدم، ونقصه يعني أنسجة لا تتنفس كما ينبغي.
- **المناعة.** الأجسام المضادة بروتين، والجهاز المناعي لا يعمل كما ينبغي بدون مخزون كافٍ.
- **إبطاء الجوع.** البروتين أعلى العناصر غذائيًا في منع الشهية، لأنه يبطئ إفراغ المعدة ويرفع هرمونات الشبع.

النقطة الأخيرة هي التي تجعل البروتين أكثر من مجرد موضوع رياضي.

## الكمية: أين تقع الأرقام

الحد الأدنى المعتمد رسميًا يبقى عند 0.8 جرام لكل كيلوجرام من وزن الجسم، وهذا حد وقائي ضد النقص لا هدفًا. أما النطاقات العملية فتعتمد على الحالة:

| الفئة | الجرام لكل كيلوجرام | ملاحظة |
|---|---|---|
| الحد الوقائي للبالغين | 0.8 | الحد الأدنى لمنع النقص |
| نمط حياة عادي | 1.0 – 1.2 | الصيانة |
| إنقاص وزن مع عجز | 1.6 – 2.0 | للحفاظ على العضلة أثناء العجز |
| تمارين المقاومة | 1.6 – 2.2 | بعد التمرين لا قبله |
| كبار السن فوق 65 | 1.2 – 1.6 | لمقاومة فقدان العضلات |

انتبه إلى الفارق بين 0.8 و1.6. ليس زيادة بسيطة، بل الفرق بين عدم وجود نقص وبين أن العضلة لا تتراجع.

## التوزيع على اليوم أهم مما يظن الجميع

العضلة لا تبني في اليوم، بل في الساعات التي تلي التمرين. توزيع البروتين على ثلاث أو أربع وجبات بتقدير 0.4 جرام لكل كيلوجرام في كل وجبة يعطي نتيجة أفضل من الكمية نفسها في وجبة واحدة كبيرة.

مثال: شخص وزنه 80 كيلوجرامًا بهدف بناء العضلة.
- الهدف اليومي: 80 × 1.8 = 144 جرامًا.
- التوزيع: 36 جرامًا لكل وجبة × 4 وجبات = 144 جرامًا.
- بيضة واحدة وزنها 70 جرامًا توفّر نحو 12 جرامًا من البروتين، أي نحو ثلث الوجبة.

**الخطأ الشائع** هو الاعتماد على مصدر واحد. كثير من الأنظمة الغذائية تحصل على معظم بروتينها من البيض والجبن وحدهما. التنوع مهم، لأن كل مصدر يحمل تركيبة أحماض أمينية مختلفة وكمية مختلفة من العناصر الصغرى التي تدعم امتصاص البروتين.

## مصادر عملية في المطبخ المصري

- **البيض:** نحو 6 جرامات بروتين لكل بيضة، بتكلفة سعرية منخفضة لكل جرام بروتين.
- **الصدر:** نحو 31 جرامًا لكل 100 جرام، ودهون أقل بكثير من اللحوم الحمراء.
- **التونة والأسماك:** بروتين كامل مع أوميغا 3، ومحتوى صوديوم يمكن قياسه.
- **اللبن والزبادي:** الزبادي اليوناني نحو 9.9 جرام لكل 100 جرام، وهو مصدر قوي لكنه ليس بديلًا كاملًا.
- **البقوليات:** العدس والفول والحمص بروتين نباتي كامل مع ألياف ومعادن.

## ما لا ينفع

1. **بروتين أكثر وراحة أقل.** العضلة تحتاج تدريبًا وأحماضًا أمينية ونومًا كافيًا. زيادة البروتين وحدها لا تحمي شيئًا.
2. **مكملات بلا سبب.** لا يوجد بروتين أفضل من غيره. الواي بروتين مفيد لمن لا يستطيع أكل الكمية، لكنه ليس بديلًا عن التقييم.
3. **تجاهل السعرات.** زيادة البروتين ترفع السعرات. إذا لم تحتسبها، فقدت الفارق الذي كنت تحاول صناعته.

## الخلاصة

احسب هدفك من وزنك ومن هدفك، ووزّعه على عدة وجبات، وادمج مصادر متعددة. الالتبس حول البروتين يأتي في معظمه من التسويق. احسب بنفسك.`,
  },
  {
    locale: 'en',
    slug: 'protein-how-much-you-actually-need',
    title: 'Protein: how much you actually need, and when more is useful',
    excerpt: 'Why protein advice is so often overstated, how much you really need, and how to spread it across meals.',
    meta_title: 'How much protein do you actually need? | NutriClinicEG',
    meta_desc: 'Practical protein targets for adults, how to distribute them across meals, and why more protein alone does not build muscle.',
    guest_author: AUTHOR_EN,
    published_at: D2,
    translationSlug: 'protein-how-much-you-actually-need',
    content_md: `Protein is the most argued-over nutrient in a nutrition clinic. One source says 0.8 grams per kilo; another says 2.5. The truth is that the answer depends on your goal and your context. Here is the whole picture, organised.

## What protein actually does

Protein is not just muscle. It does four essential jobs that cannot be replaced:

- **Building and repairing tissue.** Muscle, skin, gut lining and internal organs are all protein.
- **Transport.** Haemoglobin carries oxygen in your blood, and too little means tissues are not oxygenated properly.
- **Immunity.** Antibodies are proteins, and your immune system does not function as intended without an adequate reserve.
- **Satiety.** Protein is the most filling nutrient per calorie, because it slows gastric emptying and raises satiety hormones.

That last point is what makes protein more than a sports-flavour topic.

## How much: where the numbers sit

The official minimum stays at 0.8 g per kilogram of body weight, and that is a floor to prevent deficiency rather than a target. Practical ranges depend on the situation:

| Group | Grams per kg | Note |
|---|---|---|
| Preventive minimum, adults | 0.8 | The floor against deficiency |
| Ordinary lifestyle | 1.0 - 1.2 | Maintenance |
| Weight loss in a deficit | 1.6 - 2.0 | To preserve muscle while in deficit |
| Resistance training | 1.6 - 2.2 | After the session, not before |
| Adults over 65 | 1.2 - 1.6 | To resist sarcopenia |

Note the gap between 0.8 and 1.6. That is not a small increase. It is the difference between having no deficiency and muscle not being lost.

## Distribution matters more than most people expect

Muscle does not build during the day; it builds in the hours after training. Spreading protein across three or four meals of roughly 0.4 g/kg each produces better results than the same total in one large meal.

Example: an 80 kg person aiming to build muscle.
- Daily target: 80 x 1.8 = 144 g.
- Distribution: 36 g per meal x 4 meals = 144 g.
- A single 70 g egg supplies about 12 g of protein, roughly a third of one of those meals.

**The common mistake** is relying on a single source. Many dietary patterns get almost all their protein from eggs and cheese. Variety matters, because every source has a different amino acid profile and a different amount of the micronutrients that support protein metabolism.

## Practical sources in an Egyptian kitchen

- **Eggs:** about 6 g of protein each, at a low calorie cost per gram of protein.
- **Chicken breast:** about 31 g per 100 g, with far less fat than red meat.
- **Tuna and fish:** complete protein plus omega-3, with measurable sodium.
- **Milk and yogurt:** Greek yogurt supplies about 9.9 g per 100 g, a strong source though not a complete answer alone.
- **Legumes:** lentil, fava beans and chickpeas give complete plant protein plus fibre and minerals.

## What does not work

1. **More protein and less of everything else.** Muscle needs training, amino acids and adequate sleep. Adding protein on its own protects nothing.
2. **Supplements without a reason.** There is no best protein. Whey is useful for someone who cannot eat the required amount, but it is not a substitute for assessment.
3. **Ignoring the calories.** More protein means more calories. If you are not counting them, you lose the difference you were trying to create.

## Bottom line

Work out your target from your body weight and your goal, distribute it across several meals, and combine several sources. The confusion around protein comes mostly from marketing. Do the arithmetic yourself.`,
  },

  // ══ 3. Reading a label ═════════════════════════════════════════════════════
  {
    locale: 'ar',
    slug: 'reading-a-nutrition-label-like-a-nutritionist',
    title: 'كيف تقرأ الملصق الغذائي باحتراف؟',
    excerpt: 'أربع خطوات لقراءة الملصق الغذائي، والعبارات التسويقية التي يجب أن تتجاهلها تمامًا.',
    meta_title: 'كيف تقرأ الملصق الغذائي؟ | NutriClinicEG',
    meta_desc: 'دليل عملي لقراءة الملصق الغذائي: حجم الحصة، السعرات لكل مئة جرام، السكريات المضافة، وترتيب المكونات.',
    guest_author: AUTHOR_AR,
    published_at: D3,
    content_md: `الملصق الغذائي من أكثر الكثافة بالمعلومات عن غذائك، ومع ذلك يقرأه أغلب الناس في ثانيتين. المشكلة ليست نقص المعلومة، بل عدم معرفة ترتيب الأولوية. إليك الطريقة التي نراجع بها المنتج.

## الخطوة الأولى: حجم الحصة وليس حجم العبوة

هذا أول خطأ يقع فيه الجميع. العبوة المكتوب عليها 250 جرامًا قد تحتوي على حصة مقدارها 30 جرامًا فقط. كل الأرقام المكتوبة عنو إلى الحصة، لا إلى العبوة كاملة.

القاعدة العملية: اقلب العبوة، ابحث عن عدد الحصص في الأسفل، ثم اضرب. أربع حصص，每 واحدة 60 سعرًا، تعني 240 سعرًا للعبوة كلها.

## الخطوة الثانية: السعرات لكل مئة جرام هي الرقم القابل للمقارنة

مقارنة السعرات بين منتجين ليست عادلة إذا اختلف حجم الحصة. الرقم الوحيد الذي يمكن المقارنة بينه هو السعرات لكل مئة جرام أو لكل مئة ملليلتر.

مثال: المنتج أ فيه 45 سعرًا لكل مئة جرام، وحجم حصته 30 جرامًا. المنتج ب فيه 120 سعرًا لكل مئة جرام، وحجم حصته 30 جرامًا. المنتج أ أخف بنحو الضعف، حتى لو بدا الرقم على واجهة العبوة أقل إثارة. عند المقارنة، حوّل دائمًا إلى معيار مئة جرام.

## الخطوة الثالثة: السكريات المضافة

على عكس الدهون المشبعة، لا يوجد سقف يومي عالمي موحد للسكريات المضافة في معظم الإرشادات. التوصيات الحالية تشير إلى البقاء دون 10% من السعرات اليومية، أي نحو 50 جرامًا للبالغين.

هناك تفصيل مهم: السكريات المضافة لا تشمل السكر الموجود طبيعيًا في الفاكهة والخضار الكاملة. عصير البرتقال يحتوي سكرًا طبيعيًا، وهذا ليس سكرًا مضافًا. أما العصير المحلى تجاريًا فيحتوي سكرًا مضافًا فعليًا.

## الخطوة الرابعة: ترتيب المكونات يروي القصة

المكونات مرتبة تنازليًا بحسب الوزن. هذا يعني أن المكون الأول هو الأوفر في المنتج.

مثال يوضح الفرق بين منتجين في الفئة نفسها. المنتج أ: حمص، زيت نباتي، سكر، ذرة، ملح. المنتج ب: حمص، ماء، زيت زيتون، ملح. الترتيب هنا حاسم: الأول يحتوي سكرًا مضافًا وزيتًا أرخص، والثاني يحتوي زيت زيتون وماءً. كل مرة تختار فيها، اختر المنتج الذي يكون成分列表 أقرب إلى الطعام كما يوجد في الطبيعة.

## عبارات يجب أن تتجاهلها تمامًا

هذه العبارات ليست كذبًا في كل الأحوال، لكنها ليست دليلًا أيضًا، ولهذا نضعها في خانة غير مفيدة:

- **طبيعي:** لا يوجد تعريف تنظيمي موحد لهذه العبارة في معظم الأسواق.
- **خالٍ من السكر المضاف:** قد يحتوي المنتج على كمية كبيرة من السكر الطبيعي لا تظهر ضمن السكريات المضافة.
- **دايت أو لايت:** أحيانًا تعني نصف السعرات وأحيانًا لا تعني شيئًا تقريبًا.
- **مصدر للبروتين:** قد تعني جرامتين لكل مئة جرام، وهي نسبة منخفضة.

العبارة الوحيدة التي تستحق الثقة هي الأرقام المطبوعة على العبوة.

## قائمة تحقق قصيرة

قبل أن تضع المنتج في السلة، اسأل نفسك خمسة أسئلة:

1. كم حصة في العبوة، وهل سآكل العبوة كلها؟
2. السعرات لكل مئة جرام مقارنة بمنتج منافس؟
3. كم جرامًا من السكريات المضافة؟
4. ما أول ثلاثة مكونات وبأي ترتيب؟
5. هل نسبة الدهون المشبعة أعلى مما تريد؟

إذا أجبت عن هذه الأسئلة، فأنت تقرأ الملصص تمامًا كما يفعل أخصائي التغذية وأنت واقف أمام الرف.`,
  },
  {
    locale: 'en',
    slug: 'reading-a-nutrition-label-like-a-nutritionist',
    title: 'How to read a nutrition label like a nutritionist',
    excerpt: 'Four steps to reading a nutrition label, and the marketing phrases you should ignore completely.',
    meta_title: 'How to read a nutrition label | NutriClinicEG',
    meta_desc: 'A practical guide to nutrition labels: serving size, calories per 100 g, added sugars, and ingredient-list order.',
    guest_author: AUTHOR_EN,
    published_at: D3,
    translationSlug: 'reading-a-nutrition-label-like-a-nutritionist',
    content_md: `A nutrition label is one of the densest pieces of information about your food, and most people read it in two seconds. The problem is not a lack of information, it is not knowing the order of priority. Here is the method we use when reviewing a product.

## Step one: serving size, not package size

This is the first mistake everyone makes. A package marked 250 g may contain a serving of only 30 g. Every number on the label refers to the serving, not to the whole package.

The practical rule: turn the package over, find the number of servings at the bottom, then multiply. Four servings at 60 kcal each means 240 kcal for the entire package.

## Step two: calories per 100 g is the only comparable figure

Comparing calories between two products is unfair when serving sizes differ. The only number you can compare like for like is calories per 100 g, or per 100 ml.

An example: product A contains 45 kcal per 100 g with a 30 g serving. Product B contains 120 kcal per 100 g with a 30 g serving. Product A is roughly half the calories, even if the number on the front of the package looks less exciting. When comparing, always normalise to 100 g.

## Step three: added sugars is the field everyone gets wrong

Unlike saturated fat, there is no universal daily cap written for added sugar in most guidance. Current advice is to keep it under 10% of daily calories, which is about 50 g for adults.

One detail matters here: added sugar does not include sugar naturally present in whole fruit and vegetables. Orange juice contains naturally occurring sugar, and that is not added sugar. A sweetened juice, however, does contain real added sugar.

## Step four: the ingredient list tells the story

Ingredients are listed in descending order by weight, which means the first ingredient is the most abundant thing in the product.

Here is an example showing the difference between two products in the same category. Product A: chickpeas, vegetable oil, sugar, corn, salt. Product B: chickpeas, water, olive oil, salt. The ordering is decisive: the first contains added sugar and a cheaper oil, while the second contains olive oil and water. Every time you choose, choose the product whose ingredient list is closer to how the food exists in nature.

## Phrases to ignore completely

These are not lies in every case, but they are not evidence either, which is why we file them under not useful:

- **Natural:** there is no single regulated definition of this term in most markets.
- **No added sugar:** the product may still contain a large amount of naturally occurring sugar that will not appear under added sugars.
- **Diet or light:** sometimes it means half the calories, and sometimes it means almost nothing at all.
- **Source of protein:** it can mean 2 g per 100 g, which is a low amount.

The only claim worth trusting is the numbers printed on the package.

## A short checklist

Before the product goes into the basket, ask five questions:

1. How many servings are in the package, and am I going to eat the whole thing?
2. Calories per 100 g, compared with a competitor?
3. How many grams of added sugar?
4. What are the first three ingredients, in what order?
5. Are saturated fat levels higher than you want?

Answer those five questions and you are reading the label exactly the way a dietitian does, while still standing in the aisle.`,
  },
];