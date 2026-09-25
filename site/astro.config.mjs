// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { REPO_URL, syncFromProtocolRepo } from './scripts/sync-protocol.mjs';


// Deployment settings come from the environment so local builds stay at the root:
//   SITE_ORIGIN  e.g. https://lionsr.github.io
//   BASE_PATH    e.g. /app-registry
//   NOINDEX      "true" keeps search engines away before launch
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const withBase = (/** @type {string} */ path) => base.replace(/\/$/, '') + path;

// Generated pages link with the base already applied.
const { versions, latest } = syncFromProtocolRepo(withBase);

// https://astro.build/config
export default defineConfig({
	site: process.env.SITE_ORIGIN,
	base,
	redirects: {
		'/protocol/latest': withBase(`/protocol/${latest}/`),
		// The homepage is the papers listing.
		'/papers': withBase('/'),
	},
	integrations: [
		starlight({
			title: 'Agentic Publication Protocol',
			head: process.env.NOINDEX === 'true' ? [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }] : [],
			customCss: ['./src/styles/custom.css'],
			components: { SocialIcons: './src/components/HeaderLinks.astro', Footer: './src/components/Footer.astro' },
			social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
			sidebar: [
				{ label: 'About APP', slug: 'about' },
				{ label: 'Publish your paper', slug: 'publish' },
				{ label: 'For agents', slug: 'agents' },
				{ label: 'Videos', slug: 'videos' },
				{
					label: 'Guides',
					items: ['guides/install', 'guides/publish', 'guides/read'],
				},
				{
					label: 'Protocol',
					items: versions.map((v) => ({
						label: v === latest ? `${v} (latest)` : v,
						slug: `protocol/${v}`,
					})),
				},
				{
					label: 'Reference',
					items: ['reference/skills', 'terms'],
				},
			],
		}),
	],
});
