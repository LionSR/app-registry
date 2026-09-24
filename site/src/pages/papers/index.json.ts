import type { APIRoute } from 'astro';
import { allPapers } from '../../lib/papers';

export const GET: APIRoute = async () => Response.json(await allPapers());
