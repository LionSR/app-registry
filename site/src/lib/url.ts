/** Site-internal path with Astro's `base` applied, e.g. url('/papers/') -> '/app-registry/papers/'. */
export const url = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path;

/** The current path without the base, for "which section am I in" checks. */
export const stripBase = (pathname: string) => {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
};
