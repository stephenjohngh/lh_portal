// src/lib/apps/planner/utils/recurrence.js
// Turning "every March" into dates — pure, Type-1 testable, no DOM and no DB.
//
// This is the part of the planner that had to exist before anything else, and
// the part everything else trusts. It is also the reason the planner is not
// built on the portal's existing scheduling: `frequency_days`, which both the
// maintenance regime and the inspection definitions use, cannot say "every
// March" or "the first Monday of the month" at all.
//
// ── Dates are plain strings, and the arithmetic is UTC ──────────────────────
// A planner event is a wall-clock thing: the AGM is on 14 November, not at an
// instant. Dates are therefore 'YYYY-MM-DD' throughout and every calculation
// goes through Date.UTC, which has no daylight saving to shift under it. A time
// of day, where an event has one, rides alongside as a separate local time and
// is never folded into the date (see the app's design note).
//
// ── Anchored vs drifting ────────────────────────────────────────────────────
// Anchored: occurrences come from the SERIES. The AGM is in November whether or
// not last year's ran late.
// Drifting: they come from the last COMPLETION. A boiler service is due twelve
// months after it was actually done.
// Both are real, so the series says which it is and this module honours it —
// see `expandSeries`, which takes the anchor as an argument rather than
// assuming one.

/** How many occurrences one expansion will ever return. */
export const MAX_OCCURRENCES = 400;

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' → { y, m, d } with m 1-12. */
export function parseISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!match) return null;
  return { y: +match[1], m: +match[2], d: +match[3] };
}

/** { y, m, d } → 'YYYY-MM-DD'. */
export function formatISO(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days in a month — 1-indexed month. */
export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Day of week for a date, 0 = Sunday. */
export function weekdayOf(iso) {
  const p = parseISO(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null;
}

/** Add days to a 'YYYY-MM-DD', returning the same shape. */
export function addDaysISO(iso, days) {
  const p = parseISO(iso);
  if (!p) return null;
  const t = Date.UTC(p.y, p.m - 1, p.d) + days * DAY_MS;
  const d = new Date(t);
  return formatISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from a to b. Negative when b is earlier. */
export function daysBetween(a, b) {
  const pa = parseISO(a);
  const pb = parseISO(b);
  if (!pa || !pb) return 0;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}

/**
 * The day-of-month an event falls on in a given month.
 *
 * CLAMPED to the end of the month rather than skipped. iCal's answer is that
 * BYMONTHDAY=31 simply does not occur in June — correct for a calendar
 * protocol, and wrong here: somebody who says "meter readings on the 31st"
 * means the end of the month, and a planner that silently drops four months of
 * the year would be lying about the year. `-1` asks for the last day outright.
 */
export function clampDay(y, m, day) {
  const last = daysInMonth(y, m);
  if (day === -1 || day > last) return last;
  return Math.max(1, day);
}

/**
 * The date of the nth given weekday in a month — "first Tuesday", "last Friday".
 *
 * Returns null when there is no such day: a fifth Tuesday exists in some months
 * and not others, and inventing one would put the directors' meeting in the
 * following month. `nth = -1` is the last one, which always exists.
 */
export function nthWeekdayOf(y, m, weekday, nth) {
  const last = daysInMonth(y, m);

  if (nth === -1) {
    for (let d = last; d >= 1; d--) {
      if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) return formatISO(y, m, d);
    }
    return null;
  }

  let seen = 0;
  for (let d = 1; d <= last; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) {
      seen += 1;
      if (seen === nth) return formatISO(y, m, d);
    }
  }
  return null;
}

/**
 * Every date a rule produces between `from` and `to` inclusive.
 *
 * @param {object} rule
 * @param {'once'|'daily'|'weekly'|'monthly'|'yearly'} rule.freq
 * @param {number} [rule.interval]   every N days/weeks/months/years (default 1)
 * @param {number[]} [rule.weekdays] weekly: 0-6, Sunday first
 * @param {number} [rule.monthDay]   monthly/yearly: 1-31, or -1 for the last day
 * @param {number} [rule.nth]        monthly/yearly: 1-5, or -1 for the last
 * @param {number} [rule.weekday]    monthly/yearly: used with nth
 * @param {number} [rule.month]      yearly: 1-12
 * @param {string} [rule.until]      last date the series may produce
 * @param {number} [rule.count]      stop after this many occurrences
 * @param {string} anchor            where the series starts counting from
 * @param {string} from
 * @param {string} to
 * @returns {string[]} ISO dates, ascending
 */
export function expandRule(rule, anchor, from, to) {
  const start = parseISO(anchor);
  if (!start || !parseISO(from) || !parseISO(to) || !rule?.freq) return [];

  const interval = Math.max(1, rule.interval ?? 1);
  const limit = rule.until && rule.until < to ? rule.until : to;
  const out = [];

  // `count` is counted from the anchor, not from the window — so paging through
  // next year does not hand the series a fresh allowance.
  let produced = 0;
  const take = (iso) => {
    if (!iso || iso > limit) return false;
    if (rule.count && produced >= rule.count) return false;
    produced += 1;
    if (iso >= from) out.push(iso);
    return true;
  };

  if (rule.freq === 'once') {
    take(anchor);
    return out;
  }

  if (rule.freq === 'daily') {
    for (let d = anchor; d <= limit; d = addDaysISO(d, interval)) {
      if (!take(d) || out.length >= MAX_OCCURRENCES) break;
    }
    return out;
  }

  if (rule.freq === 'weekly') {
    // Default to the anchor's own weekday, so a weekly series needs no more
    // than "weekly" to mean something sensible.
    const days = rule.weekdays?.length ? [...rule.weekdays].sort((a, b) => a - b)
                                       : [weekdayOf(anchor)];
    // Start from the Sunday of the anchor's week, then step whole intervals.
    const weekStart = addDaysISO(anchor, -weekdayOf(anchor));

    for (let w = weekStart; w <= limit; w = addDaysISO(w, 7 * interval)) {
      for (const day of days) {
        const iso = addDaysISO(w, day);
        if (iso < anchor) continue;           // before the series began
        if (iso > limit) break;
        if (!take(iso)) return out;
      }
      if (out.length >= MAX_OCCURRENCES) break;
    }
    return out;
  }

  if (rule.freq === 'monthly' || rule.freq === 'yearly') {
    const yearly = rule.freq === 'yearly';
    const stepMonths = yearly ? 12 * interval : interval;
    const month = yearly ? (rule.month ?? start.m) : start.m;

    // Walk months from the anchor's own month, so "every 3 months from March"
    // means March, June, September.
    let y = start.y;
    let m = yearly ? month : start.m;

    // A yearly series anchored after its month has already passed this year
    // starts next year.
    if (yearly && formatISO(y, m, 1) < formatISO(start.y, start.m, 1)) y += 1;

    for (let guard = 0; guard < 1200; guard++) {
      const iso = rule.nth
        ? nthWeekdayOf(y, m, rule.weekday ?? weekdayOf(anchor), rule.nth)
        : formatISO(y, m, clampDay(y, m, rule.monthDay ?? start.d));

      // A month with no fifth Tuesday produces nothing and is simply skipped.
      if (iso && iso >= anchor) {
        if (iso > limit) break;
        if (!take(iso)) break;
      }
      if (out.length >= MAX_OCCURRENCES) break;

      const next = m - 1 + stepMonths;        // 0-indexed for the arithmetic
      y += Math.floor(next / 12);
      m = (next % 12) + 1;

      if (formatISO(y, m, 1) > limit) break;
    }
    return out;
  }

  return out;
}

/**
 * The dates one SERIES falls on in a window, honouring how it recurs.
 *
 * The difference between the two kinds lives here rather than in the rule:
 *
 * - **anchored** counts from the series' own start date, for ever. Last year
 *   running late does not move this year.
 * - **drifting** counts from the last time it was actually done. Everything
 *   before that anchor is history — it is in the stored occurrences, not in the
 *   expansion — so only what follows is generated.
 *
 * @param {{start_date: string, recurrence: object, drifts?: boolean}} series
 * @param {string|null} lastCompleted  the most recent completed occurrence
 * @param {string} from
 * @param {string} to
 */
export function expandSeries(series, lastCompleted, from, to) {
  if (!series?.start_date) return [];

  const rule = series.recurrence ?? { freq: 'once' };

  if (!series.drifts) return expandRule(rule, series.start_date, from, to);

  // Drifting: the clock restarts at each completion. With nothing completed yet
  // the series has not started drifting, so it behaves as anchored.
  if (!lastCompleted) return expandRule(rule, series.start_date, from, to);

  // From the completion onwards — and never the completion itself, which has
  // already happened.
  const next = expandRule(intervalOnly(rule), lastCompleted, lastCompleted, to)
    .filter(d => d > lastCompleted);

  return next.filter(d => d >= from);
}

/**
 * A drifting rule, stripped of everything that names an absolute position.
 *
 * "Every year in March" and "twelve months after it was last done" are
 * contradictory instructions, and a series that carried both would follow the
 * calendar while claiming to follow the work. Once a series drifts, only the
 * SHAPE of the interval survives — yearly, quarterly, every 90 days — measured
 * from the completion. Which is, precisely, what `frequency_days` does
 * elsewhere in the portal.
 *
 * A caught mistake, not a foreseen one: the first version passed the whole rule
 * through and a boiler serviced in May was still due the following March.
 */
function intervalOnly(rule) {
  return {
    freq: rule.freq,
    interval: rule.interval,
    until: rule.until,
    count: rule.count,
  };
}

/**
 * Named intervals people actually say, expressed in the model we already have.
 *
 * Quarterly IS monthly-every-three and twice-a-year IS monthly-every-six, and
 * the engine has always produced both. What was missing is that nobody would
 * guess it: "Repeats: Monthly, Every: 3" is a puzzle, not a choice.
 *
 * So these are PRESETS over the existing four frequencies, not new ones. Adding
 * `freq: 'quarterly'` would give the expander another case to get right, and
 * would leave every rule already stored as monthly-every-three failing to
 * recognise itself.
 */
export const PRESETS = [
  { key: 'quarterly',  label: 'Quarterly',     rule: { freq: 'monthly', interval: 3 } },
  { key: 'half_year',  label: 'Twice a year',  rule: { freq: 'monthly', interval: 6 } },
];

/** Which preset a rule IS, if any — derived, never stored. */
export function presetOf(rule) {
  if (!rule) return null;
  const found = PRESETS.find(p =>
    p.rule.freq === rule.freq && p.rule.interval === Number(rule.interval));
  return found?.key ?? null;
}

/** The same rule, said as a preset. Keeps everything else about it. */
export function applyPreset(rule, key) {
  const preset = PRESETS.find(p => p.key === key);
  if (!preset) return rule;
  return { ...rule, ...preset.rule };
}

/** Weekday names, Sunday first, matching the numbers used above. */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const NTH = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };

/** 1 → 1st, 22 → 22nd. */
export function ordinal(n) {
  if (n === -1) return 'last day';
  const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * A rule in words — "the first Tuesday of every month".
 *
 * Shown wherever a series is listed. A recurrence a person cannot read is one
 * they cannot check, and a wrong rule is invisible until the year is wrong.
 */
export function describeRule(rule, { drifts = false } = {}) {
  if (!rule?.freq || rule.freq === 'once') return 'Once';

  const every = Math.max(1, rule.interval ?? 1);
  const preset = PRESETS.find(p => p.key === presetOf(rule));
  // "Quarterly" rather than "Every 3 months" — the same rule, in the words
  // somebody chose it by.
  const plural = (unit) => (preset ? preset.label
    : every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`);

  // A drifting series honours only the interval, so saying "in March" here
  // would describe behaviour it does not have.
  if (drifts) {
    const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
    return `${plural(unit)} — counted from when it was last done`;
  }

  let text;
  if (rule.freq === 'daily') {
    text = plural('day');
  } else if (rule.freq === 'weekly') {
    const days = rule.weekdays?.length
      ? rule.weekdays.map(d => WEEKDAYS[d]).join(', ')
      : null;
    text = plural('week') + (days ? ` on ${days}` : '');
  } else {
    const on = rule.nth
      ? `the ${NTH[String(rule.nth)] ?? ordinal(rule.nth)} ${WEEKDAYS[rule.weekday ?? 0]}`
      : `the ${ordinal(rule.monthDay ?? 1)}`;

    text = rule.freq === 'yearly'
      ? `${plural('year')} in ${MONTHS[(rule.month ?? 1) - 1]}, on ${on}`
      : `${plural('month')} on ${on}`;
  }

  if (rule.count)  text += `, ${rule.count} times`;
  if (rule.until)  text += `, until ${rule.until}`;
  // Said plainly, because the two behave differently in a way nobody would
  // guess from a date alone.
  if (drifts)      text += ' — counted from when it was last done';

  return text;
}
