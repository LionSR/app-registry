import type { APIRoute } from 'astro';
import { url } from '../lib/url';

// Instructions for an AI coding agent requested to publish research following agenticpapers.app.
// Linked from llms.txt, the home page, and the Publish page.
const PROTOCOL = 'LionSR/AgenticPublicationProtocol';
const RAW = `https://raw.githubusercontent.com/${PROTOCOL}/main/skills`;

export const GET: APIRoute = ({ site }) => {
	const abs = (path: string) => (site ? new URL(url(path), site).href : url(path));
	const text = `# Publishing a paper with APP: instructions for coding agents

This document provides instructions for an AI coding agent requested to publish research following agenticpapers.app.

The Agentic Publication Protocol (APP) packages a paper, code, data, and an \`AGENTS.md\` instructions file into a GitHub release.

Publishing includes two stages:
1. **Publish**: The \`publish-paper\` skill converts the project directory into a validated GitHub release in the author repository.
2. **Register** (optional): Add the release to the registry at ${abs('/')} to make the paper discoverable.

Request user approval before you install software or make changes on GitHub. The APP skills also prompt for user confirmation.

## 1. Install the APP skills

The skills are located in the GitHub repository \`${PROTOCOL}\` as the \`paper-protocol\` plugin. Verify if the \`publish-paper\` skill is already available in your environment.

### Claude Code

Run these commands in your shell:

\`\`\`bash
claude plugin marketplace add ${PROTOCOL}
claude plugin install paper-protocol@paper-protocol
\`\`\`

Ask the user to run \`/reload-plugins\` at the Claude Code prompt or restart the session. The skills become active after reload.

### Codex

Run these commands in your shell:

\`\`\`bash
codex plugin marketplace add ${PROTOCOL}
codex plugin add paper-protocol@paper-protocol
\`\`\`

These commands require network access and configuration file modifications. Request user approval if operating in a sandbox. Then ask the user to start a new Codex session.

### Other agents

The skills are standard Agent Skills folders (each contains a \`SKILL.md\`) in \`skills/\` in the repository. Clone the repository and configure your agent to load the skills:

\`\`\`bash
git clone https://github.com/${PROTOCOL}.git
\`\`\`

### Without installing

If you cannot install skills, read the skill files directly. Start with ${RAW}/publish-paper/SKILL.md. That file references modular step skills located at ${RAW}/<name>/SKILL.md.

## 2. Publish

Open the directory containing the paper, code, and data. Execute the \`publish-paper\` skill (\`/publish-paper\` in Claude Code or \`$publish-paper\` in Codex).

The workflow executes five steps:
1. Reproduce results.
2. Prepare staging.
3. Define the paper agent.
4. Validate publication assets.
5. Create the GitHub release.

The output is a public GitHub repository with a tagged release containing an \`APP_PUBLICATION.json\` manifest. This release is the official publication.

## 3. Register in the registry

After the release is created, offer to register the publication. Follow the instructions at ${abs('/agents/')}. The user authenticates through GitHub with a one-time code, and the agent submits the release URL.

## Additional resources

- Author guide: ${abs('/publish/')}
- Protocol specification: ${abs('/protocol/latest/')}
- Registered papers index: ${abs('/papers/index.json')}
`;
	return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
