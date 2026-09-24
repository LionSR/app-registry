# APP website

Astro + Starlight site for the Agentic Publication Protocol.

The protocol pages, introduction, guides and skills reference are generated at build time from `../protocol` by `scripts/sync-protocol.mjs`:

- each `vX.Y.Z` tag's `PROTOCOL.md` becomes `/protocol/X.Y.Z/`, and `/protocol/latest/` redirects to the newest tag
- selected `README.md` sections become the introduction, guide and reference pages

Do not edit those pages here. Change the protocol repo, then update the submodule.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # static output in dist/
```
