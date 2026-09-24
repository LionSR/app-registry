function need(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

export const env = () => ({
	appId: need('GITHUB_APP_ID'),
	// Vercel stores multi-line secrets fine, but accept "\n"-escaped keys too.
	privateKey: need('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
	clientId: need('GITHUB_APP_CLIENT_ID'),
	clientSecret: need('GITHUB_APP_CLIENT_SECRET'),
	registryRepo: need('REGISTRY_REPO'), // e.g. LionSR/app-registry
	siteUrl: need('SITE_URL').replace(/\/$/, ''), // e.g. https://lionsr.github.io/app-registry
});
