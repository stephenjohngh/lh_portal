// src/lib/apps/management/utils/issueSearch.test.js

import { describe, it, expect } from 'vitest';
import {
  issueMatches, searchIssues, describeMatches, MIN_QUERY, MAX_MATCHES_PER_ISSUE,
} from './issueSearch.js';

const issue = {
  id: 'i1',
  name: 'Roof leak above stair 2',
  description: 'Water coming through after heavy rain.',
  actions: [
    { id: 'a1', action_text: 'Chase the insurers for a decision', name_text: 'P. Shah' },
  ],
  activities: [
    { id: 'c1', activity_type: 'comment', created_at: '2026-03-01T10:00:00Z',
      body: '<p>Contractor says the <strong>flashing</strong> has failed.</p>' },
    { id: 'c2', activity_type: 'email', created_at: '2026-04-01T10:00:00Z',
      body: '<p>See attached.</p>',
      fields: { from: 'claims@insurer.test', subject: 'Claim 4471 acknowledged',
                mime_type: 'application/pdf' } },
  ],
};

describe('issueMatches', () => {
  it('finds the issue title and description', () => {
    expect(issueMatches(issue, 'stair')[0])
      .toMatchObject({ where: 'name', label: 'Title' });
    expect(issueMatches(issue, 'heavy rain')[0])
      .toMatchObject({ where: 'description', label: 'Description' });
  });

  it('finds text in an ACTION, which the old filter never searched', () => {
    // "Who was chasing the insurers?" is an action, and the search used to say
    // the issue did not exist.
    const [match] = issueMatches(issue, 'insurers');
    expect(match).toMatchObject({ where: 'action', label: 'Action', actionId: 'a1' });
    expect(match.snippet.text).toContain('Chase the insurers');
  });

  it('finds an action by who it belongs to', () => {
    expect(issueMatches(issue, 'Shah')[0])
      .toMatchObject({ where: 'action', label: 'Action owner' });
  });

  it('searches the TEXT of an activity, not its markup', () => {
    // The body is stored as HTML. Searching it raw matched tag names and missed
    // any phrase a tag interrupted.
    const [match] = issueMatches(issue, 'flashing has failed');
    expect(match).toMatchObject({ where: 'activity', activityId: 'c1' });
    expect(match.snippet.text).not.toContain('<');
  });

  it('does not match HTML tag names', () => {
    expect(issueMatches(issue, 'strong')).toHaveLength(0);
    expect(issueMatches(issue, 'p>')).toHaveLength(0);
  });

  it('labels an activity by its kind', () => {
    expect(issueMatches(issue, 'See attached')[0].label).toBe('Email');
    expect(issueMatches(issue, 'Contractor says')[0].label).toBe('Comment');
  });

  it('searches named email fields', () => {
    expect(issueMatches(issue, 'claims@insurer')[0])
      .toMatchObject({ label: 'From', activityId: 'c2' });
    expect(issueMatches(issue, 'Claim 4471')[0].label).toBe('Subject');
  });

  it('ignores machine fields, where a hit is noise dressed as a result', () => {
    expect(issueMatches(issue, 'application/pdf')).toHaveLength(0);
  });

  it('puts actions before activities', () => {
    const withBoth = {
      ...issue,
      actions: [{ id: 'a2', action_text: 'Order the scaffold' }],
      activities: [{ id: 'c3', activity_type: 'note', created_at: '2026-01-01T00:00:00Z',
                     body: '<p>Order the scaffold when dry.</p>' }],
    };
    expect(issueMatches(withBoth, 'scaffold').map(m => m.where))
      .toEqual(['action', 'activity']);
  });

  it('takes the newest activity first', () => {
    const both = { ...issue, name: '', description: '', actions: [],
      activities: [
        { id: 'old', activity_type: 'note', created_at: '2020-01-01T00:00:00Z', body: 'the roof' },
        { id: 'new', activity_type: 'note', created_at: '2026-01-01T00:00:00Z', body: 'the roof' },
      ] };
    expect(both.activities && issueMatches(both, 'roof').map(m => m.activityId))
      .toEqual(['new', 'old']);
  });

  it('stops at a sensible number of matches for one issue', () => {
    const noisy = { ...issue, name: '', description: '', actions: [],
      activities: Array.from({ length: 20 }, (_, i) => ({
        id: `x${i}`, activity_type: 'note', created_at: '2026-01-01T00:00:00Z', body: 'roof',
      })) };
    expect(issueMatches(noisy, 'roof')).toHaveLength(MAX_MATCHES_PER_ISSUE);
  });

  it('ignores a query too short to mean anything', () => {
    expect(issueMatches(issue, 'a')).toEqual([]);
    expect(issueMatches(issue, ' ')).toEqual([]);
    expect('a'.length).toBeLessThan(MIN_QUERY);
  });

  it('survives an issue with nothing on it', () => {
    expect(issueMatches({}, 'anything')).toEqual([]);
    expect(issueMatches(null, 'anything')).toEqual([]);
  });
});

describe('searchIssues', () => {
  const other = { id: 'i2', name: 'Bin store lighting', activities: [], actions: [] };

  it('keeps only issues with a match, and says what it found', () => {
    const results = searchIssues([issue, other], 'insurers');
    expect(results).toHaveLength(1);
    expect(results[0].issue.id).toBe('i1');
    expect(results[0].matches).toHaveLength(1);
  });

  it('returns every issue, unannotated, when there is no query', () => {
    // The list's ordinary state, in the same shape — one code path, not two.
    const results = searchIssues([issue, other], '');
    expect(results.map(r => r.issue.id)).toEqual(['i1', 'i2']);
    expect(results.every(r => r.matches.length === 0)).toBe(true);
  });

  it('survives no issues at all', () => {
    expect(searchIssues(undefined, 'x')).toEqual([]);
  });
});

describe('describeMatches', () => {
  it('counts matches AND issues, because either alone misleads', () => {
    const results = searchIssues([issue], 'the');
    expect(describeMatches(results, 'the')).toMatch(/match(es)? in 1 issue/);
  });

  it('says plainly when nothing matched', () => {
    expect(describeMatches([], 'zebra')).toBe('Nothing matches “zebra”.');
  });

  it('says nothing at all when nobody is searching', () => {
    expect(describeMatches([], '')).toBe('');
  });
});
