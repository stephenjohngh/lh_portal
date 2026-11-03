import { describe, it, expect } from 'vitest';
import {
  resolveClientAddress, clientAddressOf, rememberClientAddress, isPrivateAddress,
  addressVerdict, UNKNOWN_ADDRESS,
} from './clientAddress.js';

const req = (headers = {}) => new Request('https://x.example/', { headers });
const conn = (a) => () => a;

describe('isPrivateAddress', () => {
  it('knows the private, loopback and NAT ranges', () => {
    for (const a of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1',
      '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.4']) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
  });
  it('and does not call a public address private', () => {
    for (const a of ['81.2.69.160', '172.32.0.1', '100.128.0.1', '2a00:23c6::1', '::ffff:81.2.69.160']) {
      expect(isPrivateAddress(a), a).toBe(false);
    }
  });
});

describe('resolveClientAddress', () => {
  it('Netlify’s own header wins over everything, including a forged forwarded header', () => {
    const r = resolveClientAddress({
      request: req({ 'x-nf-client-connection-ip': '81.2.69.160', 'x-forwarded-for': '1.1.1.1' }),
      getClientAddress: conn('81.2.69.160'),
    });
    expect(r).toMatchObject({ address: '81.2.69.160', source: 'netlify' });
  });

  it('a public address from the platform beats the headers (adapter-node with ADDRESS_HEADER set)', () => {
    const r = resolveClientAddress({
      request: req({ 'x-forwarded-for': '6.6.6.6, 81.2.69.160' }), getClientAddress: conn('81.2.69.160'),
    });
    expect(r).toMatchObject({ address: '81.2.69.160', source: 'platform' });
  });

  it('behind a balancer it takes the LAST forwarded entry — a caller can only add to the left', () => {
    const r = resolveClientAddress({
      request: req({ 'x-forwarded-for': '6.6.6.6, 81.2.69.160' }), getClientAddress: conn('10.0.0.7'),
    });
    expect(r).toMatchObject({ address: '81.2.69.160', source: 'forwarded', connection: '10.0.0.7' });
  });

  it('falls back to the connection, then to unknown', () => {
    expect(resolveClientAddress({ request: req(), getClientAddress: conn('10.0.0.7') }))
      .toMatchObject({ address: '10.0.0.7', source: 'connection' });
    expect(resolveClientAddress({ request: req() })).toMatchObject({ address: UNKNOWN_ADDRESS, source: 'unknown' });
  });

  it('copes with getClientAddress throwing', () => {
    const r = resolveClientAddress({ request: req({ 'x-real-ip': '81.2.69.160' }), getClientAddress: () => { throw new Error('no'); } });
    expect(r).toMatchObject({ address: '81.2.69.160', source: 'real-ip', connection: null });
  });
});

describe('clientAddressOf', () => {
  it('returns what the hook remembered for that request', () => {
    const r = req({ 'x-forwarded-for': '6.6.6.6' });
    rememberClientAddress(r, { address: '81.2.69.160', source: 'platform', connection: '81.2.69.160' });
    expect(clientAddressOf(r)).toBe('81.2.69.160');
  });
  it('and works from the headers alone where no hook ran', () => {
    expect(clientAddressOf(req({ 'x-forwarded-for': '6.6.6.6, 81.2.69.160' }))).toBe('81.2.69.160');
  });
});

describe('addressVerdict', () => {
  it('says which deployments are fine and which need the host settings', () => {
    expect(addressVerdict({ address: 'a', source: 'netlify', connection: null }).level).toBe('ok');
    expect(addressVerdict({ address: 'a', source: 'platform', connection: null }).level).toBe('ok');
    expect(addressVerdict({ address: 'a', source: 'forwarded', connection: null }).level).toBe('check');
    expect(addressVerdict({ address: 'a', source: 'connection', connection: null }).level).toBe('problem');
    expect(addressVerdict({ address: 'a', source: 'unknown', connection: null }).level).toBe('problem');
  });
});
