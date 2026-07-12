# FF-PM-2 — Problem-interview kit (for the owner to run)

**Status:** In Review (owner action) — kit is ready; the owner must recruit and run the interviews.
This is the stage-exit metric contributor (`ops/PRODUCT.md` Lifecycle: exit evidence includes
"10+ problem interviews").

**Owner:** product-manager (kit author) · runs with: FinFlow owner · **Ticket:** FF-PM-2 · **Date:** 2026-07-12

## Why this kit, not a live interview
product-manager cannot reach real Israeli freelancers directly. This kit is built so the owner (or
anyone recruited to help) can run consistent, non-leading interviews and produce comparable notes.
Target: **10 completed interviews** minimum (stage-exit threshold).

---

## 1. Screener (who qualifies)

Use this to filter before booking a call. A candidate qualifies if they answer **yes** to the first
question and **at least one** of the next two.

| # | Screener question (he) | Screener question (en) | Qualifying answer |
|---|---|---|---|
| S1 | האם אתה/את עצמאי/ת (עוסק פטור או עוסק מורשה) או בעל/ת עסק קטן בישראל? | Are you a self-employed freelancer (Esek Patur or Esek Morshe) or small-business owner in Israel? | Yes |
| S2 | האם אתה/את מוציא/ה חשבוניות או קבלות ללקוחות באופן שוטף (לפחות אחת בחודש)? | Do you issue invoices or receipts to clients regularly (at least one per month)? | Yes |
| S3 | האם ניהול הכספים/המסים של העסק גורם לך לתסכול, בזבזני זמן, או משהו שאת/ה דוחה? | Does managing your business finances/taxes cause you frustration, cost you time, or is it something you procrastinate on? | Yes (any intensity) |

Reject/park (do not interview, but note for a future segment): incorporated companies (חברה בע"מ)
with in-house or outsourced full bookkeeping staff already handling everything — out of scope for
FinFlow's current freelancer/small-Esek focus (`ops/PRODUCT.md` Identity).

Target mix across the 10: at least 3 Esek Patur, at least 3 Esek Morshe, a spread of tenure
(<1 year self-employed vs. 3+ years) and at least 2 who use a booking/talent agent (tests the
booking-agent-commissions feature's relevance).

---

## 2. 10-question problem-discovery guide (bilingual, non-leading)

**Ground rules for the interviewer:**
- Ask about **past behavior**, not hypotheticals ("tell me about the last time…" beats "would you
  ever…").
- Do not mention FinFlow, "zero-server," "Google Drive," or any FinFlow feature until Q10 (or not at
  all, if time runs out) — the first 9 questions must stay product-agnostic so the data reflects the
  problem, not a reaction to the pitch.
- Let silences sit; don't fill gaps with suggested answers.
- Record verbatim quotes where possible, especially anything with an emotion word (frustrated,
  scary, embarrassing, relief) or a swear word — those are the highest-signal moments.

| # | Hebrew | English | What it's probing |
|---|---|---|---|
| 1 | ספר/י לי איך נראה התהליך שלך היום כשאתה/את צריך/ה להוציא חשבונית ללקוח, מהתחלה ועד הסוף. | Walk me through what happens, start to finish, the last time you needed to issue an invoice to a client. | Current workflow, tools actually used |
| 2 | אילו כלים או שיטות את/ה משתמש/ת בהם היום לניהול ההכנסות וההוצאות שלך? (אקסל, אפליקציה, נייר, רואה חשבון...) | What tools or methods do you currently use to track your income and expenses? (spreadsheet, app, paper, accountant...) | Current stack / workarounds |
| 3 | מתי בפעם האחרונה משהו בתהליך הזה גרם לך לתסכול או לקח יותר זמן ממה שציפית? מה קרה בדיוק? | Tell me about the last time something in this process frustrated you or took longer than expected. What exactly happened? | Concrete pain, not abstract |
| 4 | איך את/ה יודע/ת כמה מע"מ או מס את/ה צריך/ה להפריש בכל תקופה? | How do you currently figure out how much VAT or tax to set aside each period? | Tax-tracking pain, a core FinFlow surface |
| 5 | ספר/י לי על פעם שהיה לך בלבול או אי-ודאות לגבי חוקיות מסמך שהוצאת (חשבונית מול קבלה, מספר הקצאה, וכו'). | Tell me about a time you were confused or unsure about a document's legal correctness (invoice vs. receipt, allocation number, etc). | ITA compliance anxiety — validates the Esek Patur/Morshe landmine |
| 6 | האם יש לך רואה חשבון או יועץ מס? איך נראה שיתוף הפעולה איתו/ה סביב הכנת הדוחות? | Do you have an accountant or tax advisor? What does working with them around report prep look like? | Accountant-handoff need — flagged gap in FF-PM-1 |
| 7 | אם עבדת/עובד/ת עם סוכן/ת הזמנות או מתווך/ת, איך את/ה עוקב/ת אחרי העמלות שלו/ה מול ההכנסה שלך? | If you've worked with a booking agent or intermediary, how do you track their commission against your income? | Validates booking-agent-commission feature relevance |
| 8 | מה הדבר הכי מפחיד או הכי מלחיץ בניהול הכספים של העסק שלך? | What's the scariest or most stressful part of managing your business finances? | Emotional intensity ranking — feeds prioritization |
| 9 | כמה זמן, בערך, את/ה מעריך/ה שאת/ה מבזבז/ת בחודש על ניהול חשבוניות/הוצאות/דוחות? | Roughly how much time per month do you estimate you spend on invoicing/expenses/reporting admin? | Time-cost quantification — ties to pricing willingness |
| 10 | אם היה קיים כלי שפותר לך את [הבעיה הכי גדולה שהזכרת], כמה היית מוכן/ה לשלם עליו בחודש, ולמה? | If a tool existed that solved [the biggest problem they mentioned], how much would you be willing to pay per month, and why? | Willingness-to-pay — feeds FF-PM-3 pricing hypothesis. Ask this **last**, and mirror back their own words for "the problem," not a FinFlow pitch. |

**Optional close (only if time and rapport allow):** describe FinFlow's zero-server model in one
sentence ("all your data stays in your own Google Drive, not on our servers") and gauge reaction —
note verbatim, don't lead ("does that matter to you?" not "isn't that great?").

---

## 3. Recruiting plan (mapped to declared channels)

`ops/PRODUCT.md` Growth & distribution names three channels: SEO/content, communities & social,
owner's existing audience/referrals. Recruiting for 10 interviews should draw from all three so the
sample isn't biased toward one distribution mode (the same bias FF-MKT-1's waitlist will need to
watch for).

| Channel | Recruiting action | Target count | Notes |
|---|---|---|---|
| Owner's existing audience/referrals | Direct outreach to freelancers/business owners the owner already knows (clients, colleagues, family-business network) — DM or call, offer 15–20 min | 4–5 | Fastest to book; risk: sample skews toward owner's own network (same industry, same tax posture) — don't let this alone hit 10 |
| Communities & social (freelancer groups) | Post in 2–3 Israeli freelancer/small-business Facebook groups or WhatsApp/Telegram communities ("עצמאים ישראל", local business-owner groups); offer a short screener link, 15 min video call | 3–4 | Use the S1–S3 screener as a public post filter (e.g. "מחפש/ת 15 דקות מעצמאים שמוציאים חשבוניות") — do not mention FinFlow by name in the recruiting post to avoid priming answers |
| SEO/content-adjacent | If FF-MKT-1's landing page/waitlist is live, add an opt-in "we'd love 15 min of your time" checkbox/link on the waitlist confirmation — passive, but validates people already showing interest via search intent | 1–2 | Depends on FF-MKT-1 shipping first; log as a stretch source, not a blocker for the other two |

**Logistics:** 15–20 min per call, video or phone, Hebrew-first (offer English if the candidate
prefers). Record only with explicit consent; otherwise take live notes. No incentive budget exists
($0/mo cap) — frame as "help shape a free tool," optionally offer early access to whatever ships next.

**Pace suggestion:** 2–3 interviews/week is sustainable solo; 10 interviews ≈ 3–4 weeks if run
alongside other owner work. Don't batch all 10 in one week — spacing lets early interviews' findings
sharpen later questions (this is discovery, not a fixed survey).

---

## 4. Synthesis template (fill in after each interview, then roll up every 3–4)

### Per-interview notes (copy this block per interview)

```
Interview #: 
Date:
Esek type (Patur/Morshe): 
Tenure self-employed:
Uses a booking agent? (Y/N)
Current tool(s) for invoicing/expenses:
Biggest pain (verbatim quote):
Tax/compliance confusion moment (Q5 answer, verbatim):
Time spent/month (Q9 answer):
Willingness to pay (Q10 answer, verbatim + number if given):
Reaction to zero-server pitch (if asked):
Anything surprising / off-script:
```

### Roll-up (after every 3–4 interviews, and a final roll-up at 10)

```
Interviews completed so far: __ / 10
Esek Patur / Esek Morshe split: __ / __
Top 3 recurring pains (ranked by frequency + emotional intensity):
 1.
 2.
 3.
Recurring tools/workarounds mentioned:
Recurring compliance-confusion themes (ties to FF-PM-1's ITA allocation-number gap):
Willingness-to-pay range observed (₪/mo, low–high, median):
Booking-agent-commission relevance (count who use one; how they track it today):
Verdict so far: PROBLEM VALIDATED / MIXED / NOT VALIDATED (state the evidence, not a gut call)
Recommended next action (more interviews / proceed to stage-2 features / pivot a specific pain
into a ticket):
```

**Stage-exit tie-in:** once 10 are complete, the final roll-up feeds the Validate-stage exit
decision (`ops/PRODUCT.md` Lifecycle: "20+ waitlist signups, 10+ problem interviews, or pre-orders")
alongside FF-MKT-1's waitlist count. Bring the completed roll-up back to product-manager to re-rank
`ops/ROADMAP.md`'s Now list off real evidence.
