import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Registry entries live outside the site, in ../registry/entries/<YYMM>/<ID>.json.
// A malformed entry fails the build.
// Each version carries the paper's metadata as released at its tag.
const version = z.object({
	v: z.number().int().positive(),
	tag: z.string(),
	commit: z.string().regex(/^[0-9a-f]{40}$/),
	app_publication_id: z.string().startsWith('app-v1:sha256:'),
	release_url: z.string().url(),
	listed_at: z.string().date(),
	title: z.string(),
	authors: z.array(z.object({ name: z.string(), affiliation: z.string().optional(), github: z.string().optional() })).optional(),
	domain: z.string().optional(),
	arxiv_id: z.string().optional(),
	tags: z.array(z.string()).optional(),
	paper_summary: z.string().optional(),
});

const papers = defineCollection({
	loader: glob({ pattern: '*/APP-*.json', base: '../registry/entries', generateId: ({ data }) => data.id as string }),
	schema: z.object({
		id: z.string().regex(/^APP-\d{6}-\d{4}$/),
		repo_url: z.string().url(),
		versions: z
			.array(version)
			.min(1)
			.refine((vs) => vs.every((v, i) => v.v === i + 1), 'versions must be numbered 1, 2, 3, … in order'),
	}),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	papers,
};
