import type { APIRoute } from 'astro';
import { url } from '../lib/url';

// Instructions for a coding agent whose person asked it to publish a paper "following agenticpapers.app".
// Linked from llms.txt, the home page and the Publish page. The install commands mirror publish.mdx.
const PROTOCOL = 'LionSR/AgenticPublicationProtocol';
const RAW = `https://raw.githubusercontent.com/${PROTOCOL}/main/skills`;

export const GET: APIRoute = ({ site }) => {
	const abs = (path: string) => (site ? new URL(url(path), site).href : url(path));
	const text = `# Publishing a paper with APP: instructions for coding agents

This page is for a coding agent whose person asked it to publish their work following agenticpapers.app.

The Agentic Publication Protocol (APP) publishes a finished paper as a GitHub release that any coding agent can open and explain: paper, code, data, and an \`AGENTS.md\` for the reader's agent. The work is done by the APP skills, which run inside your agent. Publishing has two parts:

1. **Publish**: the \`publish-paper\` skill turns the person's working folder into a validated APP release on GitHub, in their own repository.
2. **Register** (optional): list that release in the registry at ${abs('/')}, so readers can find it.

Ask the person before installing anything, and before every step that creates or changes something on GitHub. The skills ask for these approvals too.

## 1. Install the APP skills

The skills are in the GitHub repository ${PROTOCOL}, packaged as the plugin \`paper-protocol\`. Check first whether they are already available to you (a \`publish-paper\` skill).

### Claude Code

Run in a shell:

\`\`\`bash
claude plugin marketplace add ${PROTOCOL}
claude plugin install paper-protocol@paper-protocol
\`\`\`

Then ask the person to type \`/reload-plugins\` at the Claude Code prompt, or to start a new session. The skills are not available in the current session until then.

### Codex

Run in a shell:

\`\`\`bash
codex plugin marketplace add ${PROTOCOL}
codex plugin add paper-protocol@paper-protocol
\`\`\`

These need network access and write to the Codex configuration outside the working folder, so they may need the person's approval to run outside the sandbox. Then ask the person to start a new Codex session.

### Other agents

The skills are plain Agent Skills folders (each with a \`SKILL.md\`) under \`skills/\` in the repository. Clone it and make the folders available where your agent loads skills, following your agent's documentation:

\`\`\`bash
git clone https://github.com/${PROTOCOL}.git
\`\`\`

### Without installing

If you cannot install skills, read them directly and follow them. Start with ${RAW}/publish-paper/SKILL.md. It calls step skills by name; each is at ${RAW}/<name>/SKILL.md, and files they mention sit next to them.

## 2. Publish

Open the person's working folder (their paper, code and data) and run the \`publish-paper\` skill: \`/publish-paper\` in Claude Code, \`$publish-paper\` in Codex. It walks through five steps (reproduce results, prepare staging, define the paper agent, validate, release) and can span several sessions.

The result is a public GitHub repository with a tagged release that carries an \`APP_PUBLICATION.json\` asset. That release is the publication.

## 3. Register in the registry

Only after that release exists, offer to list it here. Follow ${abs('/agents/')}: the person signs in with GitHub using a one-time code, and you submit the release URL. If the plugin has the \`register-paper\` skill, it does the same.

## More

- Human guide: ${abs('/publish/')}
- Protocol: ${abs('/protocol/latest/')}
- Registered papers: ${abs('/papers/index.json')}
`;
	return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
