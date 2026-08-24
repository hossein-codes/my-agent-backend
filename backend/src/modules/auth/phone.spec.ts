import { normalizePhone } from './otp.service';

/**
 * `normalizePhone` is the login lookup key. A number that normalizes wrongly
 * either locks a real user out or splits one person into two accounts, so every
 * accepted input shape is pinned here.
 */
describe('normalizePhone', () => {
  it.each([
    ['+989121234567', '+989121234567'],
    ['989121234567', '+989121234567'],
    ['09121234567', '+989121234567'],
    ['9121234567', '+989121234567'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    [' +98 912 123 4567 ', '+989121234567'],
    ['+98-912-123-4567', '+989121234567'],
    ['+98 (912) 123 4567', '+989121234567'],
  ])('strips spaces, dashes and parens from %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normalizePhone('09121234567');
    expect(normalizePhone(once)).toBe(once);
  });

  it('does not silently invent a country code for a non-Iranian number', () => {
    // Returned unchanged so the DTO regex rejects it upstream, rather than
    // mangling it into something that looks valid.
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
  });

  it('leaves an obviously invalid value alone for the validator to reject', () => {
    expect(normalizePhone('12345')).toBe('12345');
  });
});
