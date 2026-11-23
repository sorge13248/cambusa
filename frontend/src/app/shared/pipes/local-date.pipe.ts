import { Pipe, PipeTransform } from '@angular/core';

export function formatLocalDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toLocaleDateString();
  }
  const str = String(value).trim();
  if (!str) return '';

  // Parse YYYY-MM-DD components directly to avoid timezone shift
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? str : date.toLocaleDateString();
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? str : parsed.toLocaleDateString();
}

@Pipe({
  name: 'localDate',
  standalone: true,
})
export class LocalDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, fallback = ''): string {
    const formatted = formatLocalDate(value);
    return formatted || fallback;
  }
}
