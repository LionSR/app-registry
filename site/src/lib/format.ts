const fmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "2026-09-23" -> "Sep 23, 2026" */
export const formatDate = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));
