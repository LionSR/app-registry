import type { APIRoute } from 'astro';
import { allPapers, latest } from '../lib/papers';
import { url } from '../lib/url';

// Plain-text index for agents: https://llmstxt.org
export const GET: APIRoute = async () => {
	const papers = await allPapers();
	const lines = [
		'# Agentic Publication Protocol',
		'',
		'> A specification to publish a paper as a GitHub repository represented by an AI agent.',
		'',
		`To publish a paper or submit a release to the registry for a user, see: ${url('/start.md')}`,
		'',
		'## Docs',
		'',
		`- [About APP](${url('/about/')})`,
		`- [Publish your paper](${url('/publish/')})`,
		`- [Register a released paper in the registry, as an agent](${url('/agents/')})`,
		`- [Protocol (latest)](${url('/protocol/latest/')})`,
		`- [Publish a paper](${url('/guides/publish/')})`,
		`- [Use a published paper](${url('/guides/read/')})`,
		'',
		'## Papers',
		'',
		`All entries as JSON: ${url('/papers/index.json')}`,
		'',
		...papers.map((p) => `- [${p.id}: ${latest(p).title}](${url(`/papers/${p.id}.json`)}): ${p.repo_url} at ${latest(p).tag}`),
		'',
	];
	return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
