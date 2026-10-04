// src/lib/server/loginLockout.test.js
import { describe, it, expect } from 'vitest';
import { lockoutState, lockoutLimits } from './loginLockout.js';

// The limits in force — admin policies, the shipped defaults here.
const { perAddress: PER_ADDRESS_LIMIT, perAccount: PER_EMAIL_LIMIT } = lockoutLimits();

const fails = (n, ip) => Array.from({ length: n }, () => ({ ip_address: ip }));

describe('login lockout', () => {
  it('locks one guesser after five failures from their address', () => {
    expect(lockoutState(fails(PER_ADDRESS_LIMIT - 1, '1.1.1.1'), '1.1.1.1').locked).toBe(false);
    expect(lockoutState(fails(PER_ADDRESS_LIMIT, '1.1.1.1'), '1.1.1.1').locked).toBe(true);
  });

  // The review's finding: five wrong passwords from anywhere locked the real
  // owner out. A stranger's failures no longer lock them out from elsewhere.
  it('does not lock the owner out because a stranger failed five times', () => {
    expect(lockoutState(fails(PER_ADDRESS_LIMIT, '6.6.6.6'), '2.2.2.2').locked).toBe(false);
  });

  it('still caps guessing from many addresses at twenty per account', () => {
    const spread = Array.from({ length: PER_EMAIL_LIMIT }, (_, i) => ({ ip_address: `10.0.0.${i}` }));
    expect(lockoutState(spread, '2.2.2.2').locked).toBe(true);
  });

  it('treats an unknown address as one shared address — the old rule, never a weaker one', () => {
    expect(lockoutState(fails(PER_ADDRESS_LIMIT, null), null).locked).toBe(true);
  });

  it('reports the attempts left under whichever limit is nearer', () => {
    expect(lockoutState(fails(2, '1.1.1.1'), '1.1.1.1').remainingAfterFailure).toBe(PER_ADDRESS_LIMIT - 3);
    expect(lockoutState(fails(PER_EMAIL_LIMIT - 2, '9.9.9.9'), '1.1.1.1').remainingAfterFailure).toBe(1);
    expect(lockoutState(fails(30, '1.1.1.1'), '1.1.1.1').remainingAfterFailure).toBe(0);
  });
});

describe('the limits are the admin policy in force', () => {
  it('a stricter policy locks sooner', () => {
    const fails = Array.from({ length: 3 }, () => ({ ip_address: '1.1.1.1' }));
    expect(lockoutState(fails, '1.1.1.1', { perAddress: 3, perAccount: 20 }).locked).toBe(true);
    expect(lockoutState(fails, '1.1.1.1', { perAddress: 5, perAccount: 20 }).locked).toBe(false);
  });
});
