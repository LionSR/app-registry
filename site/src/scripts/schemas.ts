// Shapes of the data the submit page reads, declared once. Anything else is treated as unavailable.
import { z } from 'zod';

export const GitHubUser = z.object({ login: z.string() });

export const GitHubRepo = z.object({
	full_name: z.string(),
	private: z.boolean(),
	fork: z.boolean(),
	parent: z.object({ full_name: z.string() }).optional(),
});

export const GitHubRelease = z.object({
	tag_name: z.string(),
	draft: z.boolean(),
	assets: z.array(z.object({ name: z.string() })),
});

/** The registry's own listing, /papers/index.json. */
export const Listing = z.array(z.object({ id: z.string(), repo_url: z.string(), versions: z.array(z.object({ tag: z.string() })) }));

/** Replies from the submit endpoint. */
export const Submitted = z.object({ issue_url: z.url(), issue_number: z.number() });
export const Failed = z.object({ error: z.string() });
