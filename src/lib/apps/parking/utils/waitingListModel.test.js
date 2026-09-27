// src/lib/apps/parking/utils/waitingListModel.test.js
import { describe, it, expect } from 'vitest';
import {
  queue, positionOf, nextFor, validateApplication, validateOffer, bayOfferProblem,
  offerLapsed, offerBlocks, defaultExpiry, ANY_SIZE,
} from './waitingListModel.js';

const app = (id, wanted_size, joined_on, over = {}) =>
  ({ id, holder_id: `h-${id}`, wanted_size, joined_on, status: 'waiting', created_at: `${joined_on}T09:00:00Z`, ...over });

const apps = [
  app('c', 'Car', '2026-03-01'),
  app('a', 'Car', '2026-01-10'),
  app('any', ANY_SIZE, '2026-02-01'),
  app('bike', 'Bicycle', '2026-01-01'),
  app('gone', 'Car', '2025-01-01', { status: 'withdrawn' }),
];
const bay = { bay_id: 'b1', ref: 'L/PK/22', size: 'Car', tenure: 'licensable', in_service: true };

// ⭐ First come, first served (decision D5).
describe('the queue', () => {
  it('is oldest first, and includes "any size" applicants for a sized bay', () => {
    expect(queue(apps, 'Car').map(a => a.id)).toEqual(['a', 'any', 'c']);
    expect(queue(apps, 'Bicycle').map(a => a.id)).toEqual(['bike', 'any']);
  });
  it('leaves out anyone not waiting', () => {
    expect(queue(apps).map(a => a.id)).not.toContain('gone');
  });
  it('the next person for a bay is the head of its queue', () => {
    expect(nextFor(bay, apps).id).toBe('a');
    expect(nextFor({ ...bay, size: null }, apps)).toBeNull();   // an unsized bay cannot be matched
  });
  it('gives each waiting application its place', () => {
    expect(positionOf(apps[0], apps)).toBe(3);      // c: after a and "any"
    expect(positionOf(apps[4], apps)).toBeNull();   // withdrawn has no place
  });
  // Declining keeps the place: the application comes back with the same
  // joined date (the trigger refuses any other), so it sorts where it was.
  it('an application back from a declined offer is where it was', () => {
    const back = apps.map(a => a.id === 'a' ? { ...a, offers_declined: 1 } : a);
    expect(queue(back, 'Car')[0].id).toBe('a');
  });
});

describe('applications', () => {
  it('refuses a second open application for the same size', () => {
    expect(validateApplication({ holder_id: 'h-a', wanted_size: 'Car', joined_on: '2026-09-26' }, apps))
      .toMatch(/already/);
    expect(validateApplication({ holder_id: 'h-a', wanted_size: 'Bicycle', joined_on: '2026-09-26' }, apps)).toBeNull();
    expect(validateApplication({ holder_id: '', wanted_size: 'Car', joined_on: '2026-09-26' }, apps)).toMatch(/applicant/);
  });
});

describe('offers', () => {
  const when = { made_on: '2026-09-26', expires_on: defaultExpiry('2026-09-26') };

  it('expire fourteen days after they are made by default', () => {
    expect(when.expires_on).toBe('2026-10-10');
  });
  it('can be made on a free bay of the size wanted', () => {
    expect(validateOffer(apps[1], bay, [], apps, when)).toBeNull();
    expect(validateOffer(apps[2], bay, [], apps, when)).toBeNull();          // any size
  });
  it('are refused for the wrong size, a held bay, an out-of-use bay, or a bay already offered', () => {
    expect(validateOffer(apps[3], bay, [], apps, when)).toMatch(/they want Bicycle/);
    const held = [{ reference: 'PA-0002', bay_id: 'b1', status: 'active', starts_on: '2026-01-01', ends_on: null }];
    expect(validateOffer(apps[1], bay, held, apps, when)).toMatch(/PA-0002/);
    expect(bayOfferProblem({ ...bay, in_service: false }, [], apps, '2026-09-26')).toMatch(/out of use/);
    const offered = [...apps, app('x', 'Car', '2026-01-01', { status: 'offered', offered_bay_id: 'b1', offer_expires_on: '2026-10-01' })];
    expect(validateOffer(apps[1], bay, [], offered, when)).toMatch(/already been offered/);
  });
  it('a bay held by an agreement that ends before the offer is free', () => {
    const ending = [{ reference: 'PA-0002', bay_id: 'b1', status: 'notice_given', starts_on: '2026-01-01', ends_on: '2026-09-20' }];
    expect(validateOffer(apps[1], bay, ending, apps, when)).toBeNull();
  });
  it('lapse the day after they expire', () => {
    const o = { status: 'offered', offer_expires_on: '2026-10-10' };
    expect(offerLapsed(o, '2026-10-10')).toBe(false);
    expect(offerLapsed(o, '2026-10-11')).toBe(true);
  });

  // ⛔ Allocating an offered bay to anyone else from the bay panel would jump the queue.
  it('block allocating the bay to anyone but the person offered it', () => {
    const offered = [app('x', 'Car', '2026-01-01', { status: 'offered', offered_bay_id: 'b1', offer_expires_on: '2026-10-10' })];
    expect(offerBlocks(bay, 'someone-else', offered)).toMatch(/under offer/);
    expect(offerBlocks(bay, 'h-x', offered)).toBeNull();
    expect(offerBlocks(bay, 'anyone', [])).toBeNull();
  });
});

describe('an offer whose agreement is already made', () => {
  // Accepting saves the agreement, then marks the application accepted. If the
  // second step failed, accepting again would only hit the overlap rule; the
  // screen finishes the job instead.
  it('finds the live agreement for the person offered the bay, and nothing else', async () => {
    const { agreementForOffer } = await import('./waitingListModel.js');
    const app = { status: 'offered', offered_bay_id: 'b1', holder_id: 'h1' };
    const ags = [
      { id: 'x', bay_id: 'b1', holder_id: 'h2', status: 'draft' },
      { id: 'y', bay_id: 'b1', holder_id: 'h1', status: 'ended' },
      { id: 'z', bay_id: 'b1', holder_id: 'h1', status: 'draft' },
    ];
    expect(agreementForOffer(app, ags)?.id).toBe('z');
    expect(agreementForOffer(app, ags.slice(0, 2))).toBeNull();
    expect(agreementForOffer({ ...app, status: 'waiting' }, ags)).toBeNull();
  });
});
