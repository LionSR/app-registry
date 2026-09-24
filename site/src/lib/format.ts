const day = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', timeZone: 'UTC' });
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "2026-09-23" -> "Sep 23, 2026" */
export const formatDate = (iso: string) => day.format(parse(iso));

/** "2026-09-23" -> "September 2026" */
export const formatMonth = (iso: string) => month.format(parse(iso));
