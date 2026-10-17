// The public parking application's checks (migration 247): run on the page
// and again on the server.
import { describe, it, expect } from 'vitest';
import { applicationProblems, applicationRow, applicationSizes, APPLICANT_KINDS } from './applicationForm.js';

const good = { holder_type: 'leaseholder', display_name: ' Pat Smith ', email: ' Pat@Example.com ', wanted_size: 'Car', agreed: true };

describe('the public parking application form', () => {
  it('a complete one has no problems', () => {
    expect(applicationProblems(good)).toEqual({});
  });
  it('asks for who they are, a name, an email, a size and the privacy notice agreed', () => {
    const e = applicationProblems({});
    expect(Object.keys(e).sort()).toEqual(['agreed', 'display_name', 'email', 'holder_type', 'wanted_size']);
    expect(applicationProblems({ ...good, email: 'not-an-email' }).email).toBeTruthy();
    expect(applicationProblems({ ...good, agreed: 'yes' }).agreed).toBeTruthy();   // a real tick only
  });
  it('a company needs its name', () => {
    expect(applicationProblems({ ...good, holder_type: 'external_company' }).company_name).toBeTruthy();
    expect(applicationProblems({ ...good, holder_type: 'external_company', company_name: 'Acme' })).toEqual({});
  });
  it('the holder kinds and sizes are the ones the waiting list knows', () => {
    expect(APPLICANT_KINDS.map((k) => k.value)).toEqual(['leaseholder', 'occupier', 'external_individual', 'external_company']);
    expect(applicationSizes().map((s) => s.value)).toEqual(['Large car', 'Car', 'Motorcycle', 'Bicycle', 'any']);
    expect(applicationProblems({ ...good, wanted_size: 'Lorry' }).wanted_size).toBeTruthy();
  });
  it('keeps lengths within what the database takes', () => {
    expect(applicationProblems({ ...good, notes: 'x'.repeat(2001) }).notes).toBeTruthy();
  });
  it('saves the answers trimmed, the email in lower case, blanks as nothing', () => {
    expect(applicationRow({ ...good, phone: '  ' })).toEqual({ holder_type: 'leaseholder', display_name: 'Pat Smith',
      company_name: null, email: 'pat@example.com', phone: null, correspondence_address: null, wanted_size: 'Car', notes: null });
  });
});
