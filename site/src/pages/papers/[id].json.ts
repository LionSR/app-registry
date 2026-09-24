import type { APIRoute, GetStaticPaths } from 'astro';
import { allPapers, type Paper } from '../../lib/papers';

export const getStaticPaths: GetStaticPaths = async () =>
	(await allPapers()).map((paper) => ({ params: { id: paper.id }, props: { paper } }));

export const GET: APIRoute = ({ props }) => Response.json((props as { paper: Paper }).paper);
