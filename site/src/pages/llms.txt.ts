import type { APIRoute } from 'astro';
import { allPapers, latest } from '../lib/papers';
import { url } from '../lib/url';

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
		`- [About APP](${url('/about/')})`,
		`- [Publish your paper](${url('/publish/')})`,
		`- [Protocol (latest)](${url('/protocol/latest/')})`,
		`- [Publish a paper](${url('/guides/publish/')})`,
		`- [Use a published paper](${url('/guides/read/')})`,
		'',
		'## Papers',
		'',
		`All entries as JSON: ${url('/papers/index.json')}`,
		'',
		...papers.map((p) => `- [${p.id}: ${p.title}](${url(`/papers/${p.id}.json`)}): ${p.repo_url} at ${latest(p).tag}`),
		'',
	];
	return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
