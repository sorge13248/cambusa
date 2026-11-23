import { describe, it, expect } from 'vitest';
import { LocalDatePipe, formatLocalDate } from './local-date.pipe.js';

describe('LocalDatePipe', () => {
  const pipe = new LocalDatePipe();

  it('should format null/undefined as fallback or empty string', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined, 'N/A')).toBe('N/A');
  });

  it('should format YYYY-MM-DD using native toLocaleDateString()', () => {
    const expected = new Date(2027, 3, 30).toLocaleDateString();
    expect(pipe.transform('2027-04-30')).toBe(expected);
    expect(formatLocalDate('2027-04-30')).toBe(expected);
  });

  it('should format Date instance', () => {
    const d = new Date(2026, 9, 17);
    expect(pipe.transform(d)).toBe(d.toLocaleDateString());
  });
});
