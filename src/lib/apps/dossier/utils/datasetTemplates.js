// src/lib/apps/dossier/utils/datasetTemplates.js
// The built-in dataset templates — pure, Type-1 testable, no DB and no Svelte.
//
// Columns live HERE, not in the database. `dossier_datasets.key` only says
// which template a dataset is; migration 175 stores no schema at all. That
// removes a schema editor, a migration per column change, and every question
// about what happens to rows when a field is deleted.
//
// Author-defined datasets are deliberately out of scope (merge doc D2): spec 2's
// full view-configuration matrix is a small database product, and nearly all the
// value is in one well-shaped chronology.

/**
 * `layout: 'row'` marks a field that is NOT a column: it renders on a line of
 * its own beneath the row, in both the editor and the read view. An email body
 * is the case that needs it — as a column it either squeezed everything else
 * off the screen or was too narrow to read, and it is a different KIND of thing
 * from the row's other values.
 *
 * @typedef {{
 *   key: string, label: string,
 *   type: 'date'|'text'|'longtext'|'select',
 *   width?: string, options?: string[], placeholder?: string,
 *   layout?: 'column'|'row'
 * }} FieldDef
 */

export const DATASET_TEMPLATES = {
  chronology: {
    key: 'chronology',
    title: 'Chronology',
    /** What the author is being asked for, shown on an empty table. */
    blurb: 'What happened and when. The spine of most briefings.',
    fields: /** @type {FieldDef[]} */ ([
      { key: 'date',  label: 'Date',  type: 'date', width: '9rem' },
      { key: 'event', label: 'Event', type: 'text', placeholder: 'What happened' },
      {
        key: 'significance', label: 'Why it matters', type: 'longtext',
        placeholder: 'Optional — why this entry is in the chronology',
      },
    ]),
    /** Chronology sorts by date. That is what a chronology is (merge doc D2). */
    sort: 'date',
  },

  correspondence: {
    key: 'correspondence',
    title: 'Correspondence',
    blurb: 'Letters and emails, in order.',
    fields: /** @type {FieldDef[]} */ ([
      { key: 'date',    label: 'Date',    type: 'date', width: '9rem' },
      { key: 'from',    label: 'From',    type: 'text', width: '10rem' },
      { key: 'to',      label: 'To',      type: 'text', width: '10rem' },
      // One column, not two. A pasted email fills it with the subject line and
      // the author edits it into whatever actually describes the item — which
      // is what a reader scans. Splitting "subject" from "summary" gave two
      // narrow columns saying nearly the same thing.
      {
        key: 'subject', label: 'Subject / summary', type: 'text',
        placeholder: 'What this was about',
      },
      // The message itself, on its own line beneath. Never a column: a full
      // email body cannot be one.
      {
        key: 'body', label: 'Message', type: 'longtext', layout: 'row',
        placeholder: 'The message itself',
      },
    ]),
    sort: 'date',
    /**
     * Values written under an earlier key, carried across on read.
     *
     * `summary` held the pasted body before it became `body`. Without this,
     * coerceRecordFields — which drops anything the template does not define —
     * would discard those bodies the next time their row was touched.
     */
    legacy: { body: ['summary'] },
  },

  document_index: {
    key: 'document_index',
    title: 'Document index',
    blurb: 'Every document referred to, and where it came from.',
    // Every column but `notes` is given a width, so the notes column takes
    // whatever is left. Without a width on `name` the two shared the remainder
    // and notes ended up too narrow to write in.
    //
    // The declared widths are kept modest on purpose: they are a floor the
    // editor's fixed layout must fit alongside the Detail and delete columns,
    // and anything generous here comes straight out of Notes.
    fields: /** @type {FieldDef[]} */ ([
      { key: 'name',   label: 'Document', type: 'text', width: '13rem' },
      { key: 'date',   label: 'Dated',    type: 'date', width: '8.5rem' },
      { key: 'author', label: 'Author',   type: 'text', width: '9rem' },
      // No Status column. Disclosed / Withheld / Requested / Missing looked
      // useful and went unused in practice — four options that suited a
      // disclosure exercise and nothing else, taking a column's width from the
      // one field authors actually write in. Anything worth saying about a
      // document's standing goes in Notes, in the author's own words.
      {
        key: 'notes', label: 'Notes', type: 'longtext',
        placeholder: 'Anything worth saying about this document',
      },
    ]),
    sort: 'name',
  },
};

export const TEMPLATE_KEYS = Object.keys(DATASET_TEMPLATES);

/** The template for a dataset, or null — never a partially-defined fallback. */
export function templateFor(key) {
  return DATASET_TEMPLATES[key] ?? null;
}

/** A template's field definitions, or [] for an unknown key. */
export function fieldsFor(key) {
  return templateFor(key)?.fields ?? [];
}

/** Fields that are table columns. */
export function columnFields(key) {
  return fieldsFor(key).filter(f => f.layout !== 'row');
}

/** Fields that render on a line of their own beneath the row. */
export function rowFields(key) {
  return fieldsFor(key).filter(f => f.layout === 'row');
}

/**
 * Move any value stored under a superseded key onto its current one.
 *
 * Applied where records are LOADED, so everything downstream — the editor, the
 * renderer, the publish snapshot — sees only current keys. `coerceRecordFields`
 * does the same on write, so a row saved before this existed is corrected
 * rather than emptied.
 *
 * @param {string} key - the template key
 * @param {object} fields
 */
export function migrateRecordFields(key, fields = {}) {
  const legacy = templateFor(key)?.legacy;
  if (!legacy) return fields;

  let changed = false;
  const out = { ...fields };
  for (const [current, olds] of Object.entries(legacy)) {
    if (out[current]) continue;                       // already on the new key
    for (const old of [].concat(olds)) {
      if (out[old]) { out[current] = out[old]; changed = true; break; }
    }
  }
  return changed ? out : fields;
}

/**
 * Coerce one cell to the shape its column expects.
 *
 * Dates are kept as `YYYY-MM-DD` STRINGS, never Date objects: an entry in a
 * chronology is a day, not an instant, and round-tripping through a Date is
 * exactly how a British-summer-time entry ends up a day early. (The maintenance
 * capital plan hit this; see its planReport local-YMD note.)
 */
export function coerceField(field, value) {
  if (value == null) return '';
  const text = String(value);

  switch (field?.type) {
    case 'date': {
      const trimmed = text.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
    }
    case 'select':
      return field.options?.includes(text) ? text : '';
    case 'text':
    case 'longtext':
    default:
      return text;
  }
}

/** Coerce a whole row, dropping anything the template does not define. */
export function coerceRecordFields(key, fields = {}) {
  // Migrate first: dropping unknown keys is the point of this function, and a
  // superseded key is exactly the value that must survive being dropped.
  const source = migrateRecordFields(key, fields ?? {});
  const out = {};
  for (const field of fieldsFor(key)) {
    out[field.key] = coerceField(field, source?.[field.key]);
  }
  return out;
}

/** A blank row for this template. */
export function emptyRecordFields(key) {
  return coerceRecordFields(key, {});
}

/**
 * Sort records for display.
 *
 * Undated entries sink to the bottom rather than to 1970 — an author part-way
 * through building a chronology should not have their unfinished rows jump to
 * the top. `position` breaks ties, so same-day entries keep the order the
 * author put them in.
 */
export function sortRecords(key, records = []) {
  const template = templateFor(key);
  const sortKey = template?.sort ?? null;

  return [...records].sort((a, b) => {
    if (sortKey) {
      const av = a?.fields?.[sortKey] ?? '';
      const bv = b?.fields?.[sortKey] ?? '';
      if (av && !bv) return -1;
      if (!av && bv) return 1;
      if (av !== bv) return av < bv ? -1 : 1;   // ISO dates sort lexically
    }
    return (a?.position ?? 0) - (b?.position ?? 0);
  });
}

/**
 * A short human label for one row, for confirmations and audit entries.
 *
 * Takes the first two columns that have anything in them, so a chronology reads
 * "2024-09-12 — Section 20 notice served" rather than "entry". In a dense table
 * the real risk is deleting the wrong row, and only naming it guards against
 * that. Dates stay in ISO form: unambiguous, and this module has no locale.
 *
 * @param {string} key
 * @param {object} fields
 * @param {number} [limit]
 */
export function describeRecord(key, fields = {}, limit = 80) {
  const parts = [];
  for (const field of fieldsFor(key)) {
    const value = String(fields?.[field.key] ?? '').trim();
    if (value) parts.push(value);
    if (parts.length === 2) break;
  }
  const text = parts.join(' — ');
  if (!text) return 'this blank entry';
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

/** True when a row has nothing in it — used to skip saving blank additions. */
export function isBlankRecord(key, fields = {}) {
  return fieldsFor(key).every(field => !String(fields?.[field.key] ?? '').trim());
}
