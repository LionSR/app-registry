import type { APIRoute } from 'astro';
import { allPapers, latest } from '../lib/papers';

// Plain-text index for agents: https://llmstxt.org
export const GET: APIRoute = async () => {
	const papers = await allPapers();
	const lines = [
		'# Agentic Publication Protocol',
		'',
		'> A format for publishing a finished paper as a GitHub repository that an AI agent can represent.',
		'',
		'## Docs',
		'',
		'- [About APP](/about/)',
		'- [Publish your paper](/publish/)',
		'- [Protocol (latest)](/protocol/latest/)',
		'- [Publish a paper](/guides/publish/)',
		'- [Use a published paper](/guides/read/)',
		'',
		'## Papers',
		'',
		'All entries as JSON: /papers/index.json',
		'',
		...papers.map((p) => `- [${p.id}: ${p.title}](/papers/${p.id}.json): ${p.repo_url} at ${latest(p).tag}`),
		'',
	];
	return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
