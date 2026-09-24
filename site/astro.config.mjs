// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { REPO_URL, syncFromProtocolRepo } from './scripts/sync-protocol.mjs';

const { versions, latest } = syncFromProtocolRepo();

// https://astro.build/config
export default defineConfig({
	redirects: {
		'/protocol/latest': `/protocol/${latest}/`,
		// The homepage is the papers listing.
		'/papers': '/',
	},
	integrations: [
		starlight({
			title: 'Agentic Publication Protocol',
			customCss: ['./src/styles/custom.css'],
			components: { SocialIcons: './src/components/HeaderLinks.astro' },
			social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
			sidebar: [
				{ label: 'About APP', slug: 'about' },
				{ label: 'Publish your paper', slug: 'publish' },
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
					items: ['reference/skills'],
				},
			],
		}),
	],
});
