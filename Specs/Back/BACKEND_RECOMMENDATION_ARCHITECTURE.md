# Giftly — תוכנית מימוש Backend: מנגנון ההמלצות v2

**נכון לתאריך:** 2026-08-16 · **ענף:** `build-new-architecture`
**מקור סמכות יחיד:** [`Giftly_FullSpec_ForImplementation_v1.1.pdf`](Giftly_FullSpec_ForImplementation_v1.1.pdf) (גרסה 1.1, 14 באוגוסט 2026) — מסמך זה **מאחד ומחליף** את `RecommendationArchitecture_Spec_v0.8.docx` ואת `ContactRecommendationBatch_Spec_v1.0.docx`. שני אלה, וגרסאות v0.2–v0.7 שקדמו להם, עברו ל-[`Archive/`](Archive/) כארכיון היסטורי בלבד — **לא** לפנות אליהם למימוש.

מסמך זה הוא **תרגום של ה-v1.1 spec לתוכנית מימוש קונקרטית מול הקוד הקיים בפועל**: מה כבר יש, מה חסר, באיזה סדר בונים, ומה נשאר בכוונה בחוץ בשלב הזה. הוא **לא** שוכפל מהספק המקורי — לפרטי אלגוריתם מדויקים (נוסחאות, קוד pseudocode) יש לחזור למסמך המקורי; כאן רק ההפניה + מה שהקוד הקיים דורש כדי להגיע לשם.

## 0. היקף — מה זה כן ומה זה לא

- **כן:** ליבת מנגנון ההמלצות (data model, scoring, שתי הזרימות, פידבק) — פרקים 1–13 של ה-spec.
- **כן (בנפרד, phase מאוחר יותר):** שכבת שיתוף אירועים/קבוצות (פרק 14 של ה-spec) — פיצ'ר עצמאי לגמרי מבחינת סכימה ולוגיקה, לא תלוי במנגנון הניקוד. ראו §11 phase 5.
- **מחוץ להיקף בפאזה 1 (Phase 1 עצמה היתה backend-בלבד):** frontend/UI. **עדכון:** בסשן ההמשך (עדיין 2026-08-16) בוצעה עבודת UI נפרדת שממשת חלק מהצרכים שתועדו כאן ב-§12 המקורי, בתוספת שיפוץ ניווט שכבר סוכם קודם — ראו [`../Front/FRONTEND_SPEC2.md`](../Front/FRONTEND_SPEC2.md). מערכת העיצוב עצמה (טוקנים, גופנים, רכיבים) לא שונתה.
- **הערה על מסמכי UX-UI:** נמצא `UX-UI/giftly_ux2.md` — זה לא מסמך אפיון אלא log גולמי של שיחת עבודה קודמת (כולל "Ran a command", "Used 12 tools" וכו') שנשמר בטעות כ-md, ולא מסמך שמישהו כתב במכוון. `UX-UI/giftly_ux.md` הוא כן מסמך תקין (spec פונקציונלי נקי, ללא עיצוב). שני הקבצים ב-`.gitignore` (לא ב-git), אז אם רוצים למחוק את `giftly_ux2.md` זה בלתי הפיך מבחינת היסטוריה — עדיף שתחליט/י, לא נמחק אוטומטית.

## 1. פער — מצב קיים מול היעד

| נושא | מצב היום בקוד | יעד ה-spec |
|---|---|---|
| מקור המלצה | קריאה אחת ל-Gemini, בלי זיכרון | Exploitation (קטלוג פנימי מדורג) + Exploration (Gemini) + CF + קרבה דמוגרפית |
| למידה מדירוגים | דירוג נשמר ב-DB, **לא משפיע על כלום** | כל דירוג מעדכן `good_gifts_catalog`/`gift_stats_<tag>`/`negative_prefs` לפי מיפוי מדויק (§7 ב-spec) |
| קטלוג פנימי | לא קיים | `good_gifts_catalog` + 12 טבלאות `gift_stats_<tag>` + `gift_country_stats` + `gift_neighbors` |
| ניקוד | אין | Backoff היררכי דו-ממדי + Bayesian smoothing (§4.4–4.6) |
| הרכב batch עצמי | Gemini מחזיר 5 פריטים "כמו שיצא" | 15 פריטים קבועים, 5 מקורות מוגדרים (§5.2) |
| הרכב batch לאיש קשר | Gemini מחזיר 5 פריטים | דינמי עד תקרה, "מוכח אישית" → "מוכח לדומים" → Gemini → טופ-גלובלי (§6.1) |
| "חפש עוד" | לא קיים (טוען את כל הרשימה בכל פעם) | Pagination מבוסס-compute, ללא קריאת Gemini נוספת, עד תקרת 30 (§6.2–6.3) |
| פידבק לאיש קשר | אין UI/API לדירוג המלצה לאיש קשר בכלל | בינארי מתאים/לא-מתאים (§7.3) |
| פידבק עצמי | 1–5 כוכבים, לא נשאלת סיבה | 1–5 + שאלת סיבה על 1–3 (`WRONG_CONCEPT`/`WRONG_PRODUCT`/`TOO_GENERIC`, §7.1–7.2) |
| `negative_prefs` | לא קיים בשום טבלה | `user_profiles.negative_prefs`, `contacts.negative_prefs` |
| `category_tag` | לא קיים | שדה גישור על `recommendations`/`self_gift_suggestions` (§7.6) |
| Rate limit | per-user קיים (`recommendation_calls`), אך סופר גם "חפש עוד" (כי זה לא קיים) | per-user נספר רק על הבקשה הראשונה ב-session; "חפש עוד" לא קורא ל-Gemini כלל |
| "צ'אנס שני" | לא קיים | cron שהופך המלצות ללא-מדורגות אחרי X ימים ל-`rating=2` (§7.4) |
| שיתוף אירועים/קבוצות | לא קיים בשום צורה | `hosted_events`/`groups`/`group_members`/`invite_links`/`event_audience` (§14) |
| `gift_history` / "קניתי בפועל" | טבלה ישנה קיימת (`database/schema_v2.sql`), נקראת ב-`recommendations.ts` הנוכחי | **נדחה במפורש מה-MVP** ב-spec (§2.11, §12) — הטבלה תישאר לא בשימוש על ידי המנגנון החדש |

## 2. מודל הנתונים — מיגרציות נדרשות

הפניה מלאה לכל עמודה: v1.1 spec §2. כאן רק רשימת המיגרציות שצריך ליצור (ממשיכות את המספור הקיים ב-`database/`, שעצר ב-`migration_v14_avatars.sql`):

1. **`migration_v15_negative_prefs.sql`** — `negative_prefs TEXT[]` על `user_profiles` וגם `contacts`.
2. **`migration_v16_recommendation_engine_core.sql`** — הליבה:
   - `good_gifts_catalog` (§2.6)
   - `gift_stats_<tag>` × 12 — טבלה נפרדת לכל אחת מ-11 התגיות ב-Master Tag List (§2.7) + `gift_stats_general` (§2.8)
   - `gift_country_stats` (§2.9)
   - `gift_neighbors` (§2.10)
   - כל האינדקסים ב-§2.13
3. **`migration_v17_recommendations_fields.sql`** — הוספה ל-`recommendations` הקיימת: `gift_id`, `category_tag`, `batch_id`, `source` (`'gemini'|'compute'`) — `score`/`rating`/`created_at` כבר קיימים.
4. **`migration_v18_self_suggestions_fields.sql`** — הוספה ל-`self_gift_suggestions` הקיימת: `gift_id`, `category_tag`, `feedback_reason` — `batch_id`/`rating` כבר קיימים.
5. **`migration_v19_groups_events_sharing.sql`** (phase 5, נפרד) — `hosted_events`, `groups`, `group_members`, `invite_links`, `event_audience`, + `user_profiles.require_approval_for_group_invites`.

**חשוב:** אני כותב את קבצי ה-SQL בענף, אבל **לא מריץ אותם בעצמי** מול ה-Supabase — בהתאם למוסכמה הקיימת בפרויקט (כל שאר קבצי ה-migration נושאים הערה "הרץ ב-SQL Editor של Supabase"), ולכי זו פעולה על תשתית production משותפת. תריצו אותם ידנית כרגיל, לפי הסדר.

## 3. ליבת החישוב המשותפת — מודול חדש

קובץ חדש: `backend/src/services/recommendationEngine.ts`. ממומש כפונקציות טהורות/כמעט-טהורות לפי §3–4 של ה-spec:

- `resolveEffectivePreferences(selfProfile, contactAssessment)` — §3.2, priority לא union.
- `resolveEffectiveDemographics(selfProfile, contact)` — §3.3.
- `sanitize(effectivePositive, effectiveNegative)` → `cleanInterests` + `promptNegatives` — §4.1.
- `coarseFilter(cleanInterests, budgetMin, budgetMax)` — שאילתת SQL `tags && cleanInterests`, LIMIT 100 — §4.2.
- `fetchSegmentStats(candidates)` — שליפה מרוכזת לפי תגית, לא N+1 — §4.3.
- `getPrimaryTag(gift, cleanInterests)`, `getAgeBucket(birthDate)` — §4.4.
- `getEffectiveRate(gift, primaryTag, ageBucket, country)` — ה-backoff ההיררכי, §4.5.
- `smoothedRate(liked, shown, globalMean, k)` — §4.6.
- `getRankedCandidates(...)` — מרכיב הכל לרשימה מדורגת מלאה — §4.7.
- `getDemographicCloseness(giftId, ageBucket, gender, country)` — §4.8.
- `getCollaborativeNeighbors(giftId, budget, excludeIds)` — שליפה מ-`gift_neighbors` בזמן בקשה — §4.9 (החישוב עצמו הוא batch job נפרד, ראו §7 כאן).

זו הפונקציה `getRecommendations` היחידה שמזינה גם את הזרימה העצמית וגם את זרימת איש הקשר (עיקרון-העל של ה-spec, §2 שם / §1.3 כאן) — ולא רק חיפוש הקטלוג אלא כל ה-pipeline עד לרשימה המדורגת. הבדל היחיד בין שני הצרכנים הוא **הרכב ה-batch** (כמה פריטים מכל מקור, ראו §5–6 שם), לא מנוע הניקוד עצמו.

## 4. זרימת המלצות עצמיות (`backend/src/routes/selfRecommendations.ts`)

- `POST /generate` (כרגע admin-only via `x-admin-secret`, נשאר כך) — במקום קריאה ישירה ל-Gemini לכל פרופיל: כניסה ל-`getRecommendations` (§3), הרכב 15 פריטים לפי 5 המקורות המדויקים ב-spec §5.2 (טופ-קטלוג גלובלי / Gemini הקשר-מלא / תחומי-עניין exploitation+exploration / כללי / קרבה דמוגרפית), כולל `offTagProbability` להזרקת תגית לא-נבחרת.
- `GET /` — נשאר כמעט זהה, רק מוסיף `category_tag`/`gift_id` לתשובה.
- `PATCH /:id/rate` — מתרחב לקבל `feedback_reason` אופציונלי (חובה כש-`rating<=3`, לפי §6.1/§7.1 שם), ומפעיל את מיפוי §7.2: עדכון `good_gifts_catalog`/`gift_stats_<tag>` על 4–5, כתיבת `negative_prefs` על `WRONG_CONCEPT` בלבד.

## 5. זרימת המלצות לאיש קשר (`backend/src/routes/recommendations.ts`)

- `POST /` (בקשה ראשונה) — נכנס תחילה ל-§3 (effective profile), אז ל-`getRecommendations`, אז מרכיב לפי §6.1: `getProvenCandidates` (tier1 מהפרופיל המקושר, tier2 מהרשימה המדורגת), Gemini ממלא את השאר, טופ-קטלוג-גלובלי קבוע (2). `recommendation_calls` נכתב פעם אחת בלבד לכל session.
- **חדש:** `POST /search-more` — pagination מבוסס-compute בלבד (§6.2), ללא קריאת Gemini, ללא עדכון rate limit, עד תקרת 30 לכל `batch_id` (§6.3).
- **חדש:** `PATCH /:id/rate` — פידבק בינארי בלבד (`FIT`/`NOT_FIT` → `rating=5`/`rating=2`, `feedback_reason` תמיד `null`) — §7.3. משתמש באותה תשתית עדכון קטלוג כמו §7.2, בלי ENUM ייעודי.
- כתיבת פידבק תמיד ל-`contacts.negative_prefs` של המדרג (יוסי), **לעולם לא** ל-`user_profiles.negative_prefs` של המדורג (דני), גם אם מקושר — §7.5.

## 6. "צ'אנס שני" — cron job חדש

הוספה ל-`backend/src/routes/cron.ts` (או endpoint נפרד תחת אותו `x-admin-secret`): כל המלצה עם `rating IS NULL` ש-X ימים עברו מ-`created_at` (ברירת מחדל 3–5) מוצגת שוב פעם אחת (פטור חד-פעמי מדדופ); אם עדיין `NULL` אחרי חלון נוסף — מסומנת אוטומטית `rating=2` (§7.4).

## 7. Item-Based Collaborative Filtering — batch job מתוזמן

חישוב `gift_neighbors` (§4.9) הוא batch יומי נפרד, לא בזמן בקשה — Jaccard על co-rating מתוך `self_gift_suggestions` (`rating>=4` בלבד). מתאים באותו mechanism cron כמו §6 כאן, endpoint חדש תחת `cron.ts`.

## 8. Rate limiting — שינוי בהתנהגות קיימת

`recommendation_calls` (קיים) ממשיך להיספר, אבל **רק** על `source='gemini'` — כלומר רק הבקשה הראשונה של session חדש, לא על `search-more`. `api_usage`/`try_increment_gemini` (קיים) נשאר ללא שינוי מבני — נקרא רק מתוך הנקודות שבאמת קוראות ל-Gemini (בקשה ראשונה + generate העצמי + Gemini-הקשר-מלא בתוך הרכב ה-batch העצמי).

## 9. נתוני זרע (Seed data) — §10

צריך ~300 מתנות seed, מתויגות ע"י LLM מול ה-Master Tag List הסגורה (11 תגיות + כללי, §2.7), נטענות עם `shown=0`/`liked=0` בכל הטבלאות הרלוונטיות, `is_seed=true`. זו משימת תוכן נפרדת (לא קוד) — **לא מתחילה בפאזה 1**; המנגנון עובד גם עם קטלוג ריק (נופל ל-exploration טהור, §4.2 מקרה קצה), אבל האיכות בפועל תלויה בזה. מומלץ scope נפרד ברגע שהליבה עובדת end-to-end.

## 10. נקודות שטרם הוכרעו — נספח א׳ של ה-spec

ה-spec עצמו מסמן את הנקודות האלה כ"לא טכניות, דורשות קלט אנושי" ונותן ברירת מחדל מומלצת לכל אחת כדי שהמימוש לא ייתקע. **בכוונה מאמצים את ברירות המחדל המומלצות בפאזה 1** (מפורטות בנספח א׳ של ה-spec: אלגוריתם דדופ = exact match מנורמל, `score`=`null` ל-exploration טהור, בלי rate limit נפרד ל"חפש עוד", יחסי מקורות ה-batch העצמי קבועים, קישור רשימת תפוצה חד-כיווני) — כדי לא לעצור את המימוש. אם יש העדפה שונה לגבי מישהו מהם, זה שינוי קונפיגורציה קטן, לא ארכיטקטורה.

## 11. תוכנית מימוש בשלבים

| Phase | תוכן | תלות |
|---|---|---|
| **1** | ✅ מיגרציות §2 (v15–v18) + מודול `recommendationEngine.ts` (§3) + זרימה עצמית (§4) עד ל-end-to-end אחד שרץ | — |
| **2** | ✅ זרימת איש קשר מלאה (§6) — `getProvenCandidates` (tier1/tier2), Gemini fill דינמי, `POST /search-more` (compute-only pagination), `PATCH /:id/rate` בינארי, תקרת session 30 | Phase 1 |
| **3** | לולאת פידבק המשך — cron "צ'אנס שני" (§7.4) + CF batch job שמחשב `gift_neighbors` בפועל (§4.9, כרגע רק קריאה ממומשת) | Phase 1–2 |
| **4** | נתוני זרע (§10) — משימת תוכן נפרדת | Phase 1 (יכול לרוץ במקביל) |
| **5** | שיתוף אירועים/קבוצות (v1.1 spec §14, migration v19) — פיצ'ר עצמאי, לא תלוי בליבת ההמלצות | ללא תלות, יכול לרוץ בכל שלב |

Phase 1–2 הושלמו (2026-08-16). ממשיכים ל-**Phase 3**.

### הערה על Phase 2 — פשטות מכוונות מול ה-spec

- **מיזוג CF/קרבה-דמוגרפית עם הרשימה המדורגת (§4.7)**: ה-spec לא נותן מנגנון מדויק לאיחוד ציונים ממקורות שונים ("אין סדר-קדימות נוקשה, רק ציון משותף"). המימוש מנרמל קרבה דמוגרפית לפי סכום המשקלים שלה (`/3.2`) ומשתמש ב-Jaccard similarity כמו-שהוא עבור CF, כדי לקבל טווח ערכים דומה ל-smoothed rate. סביר, לא מדויק מתמטית לפי שום נוסחה שה-spec נותן (כי הוא לא נותן אחת).
- **`recommendation.score` על שורות `tier1`**: נשאר `null` — "מוצג as-is" לפי ה-spec, לא עבר את מנגנון הניקוד.
- **CF ב-`search-more`**: כל עמוד נוסף שולף מחדש את `tier1` (לצורך seed ל-CF neighbors) ומחשב את הרשימה המדורגת מחדש מאפס, במקום לשמור cache session-side של הרשימה מ-§6.1 — פשוט יותר, נכון פונקציונלית (קטלוג לא משתנה תוך כדי session), רק פחות יעיל אם יקראו ל"עוד" הרבה פעמים ברצף.
- **`gift_neighbors` עצמו**: הקריאה (`getCollaborativeNeighbors`) ממומשת; ה-batch job שמחשב את הטבלה בפועל (Jaccard על `self_gift_suggestions`) עדיין לא — נדחה ל-Phase 3. בלעדיו, מקור ה-CF פשוט תמיד ריק (מתנהג כאילו לא קיים) — לא שובר כלום, רק לא תורם עדיין.

## 12. השפעה על ה-Frontend — עודכן, חלקית מומש

הנקודה המקורית כאן (2 מקומות שבהם ה-backend יחשוף יכולת ללא UI) **מומשה בחלקה** בסשן המשך באותו יום — ראו [`../Front/FRONTEND_SPEC2.md`](../Front/FRONTEND_SPEC2.md) לפירוט המלא:

1. **שאלת-סיבה לדירוג נמוך בהמלצה עצמית** — ✅ **מומש במלואו**. `MyGiftsPage` שולח `feedback_reason` על כל דירוג ≤3, תואם ל-`PATCH /self-recommendations/:id/rate` שכבר קיים מ-Phase 1. זה היה תיקון הכרחי, לא רק שיפור — בלעדיו דירוג נמוך היה נשבר.
2. **פידבק בינארי על המלצה לאיש קשר** — ✅ **מומש במלואו, כולל ה-backend**. עם Phase 2, `PATCH /recommendations/:id/rate` קיים בפועל — `FindGiftPage` הוחלף מ-`localStorage` (שהיה stopgap מכוון) לקריאת API אמיתית שמזינה את `catalogFeedback.ts`. אותו מסך גם מחובר עכשיו ל-`POST /recommendations/search-more` ל"עוד הצעות" אמיתי (לא עוד generate).

בנוסף, מומש גם הפיצול Home/אנשי-קשר שתועד כבר קודם ב-FRONTEND_SPEC.md §9 (לא היה תלוי בעבודת ה-backend, אבל בוצע באותו סשן), ופושט חלק ה-AI ב-`ContactPage` לכפתור "חפש המלצות" בודד שמוביל למסך המלא (הקרוסלה הישנה עם התמונות הוסרה מהפרופיל עצמו).
