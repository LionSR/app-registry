// Community is its own header section: its pages show only the Community sidebar group,
// and the Docs pages show everything else.
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { stripBase } from './lib/url';

export const COMMUNITY_LABEL = 'Community';

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const inCommunity = stripBase(context.url.pathname).startsWith('/community');
	const group = route.sidebar.find((e) => e.type === 'group' && e.label === COMMUNITY_LABEL);
	if (!group || group.type !== 'group') return;

	route.sidebar = inCommunity ? group.entries : route.sidebar.filter((e) => e !== group);

	// Pagination is computed from the full sidebar, so drop links that cross the section boundary.
	const crosses = (link?: { href: string }) =>
		link !== undefined && stripBase(link.href).startsWith('/community') !== inCommunity;
	if (crosses(route.pagination.prev)) route.pagination.prev = undefined;
	if (crosses(route.pagination.next)) route.pagination.next = undefined;
});
