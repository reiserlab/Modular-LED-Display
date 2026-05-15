# Project guidance for AI assistants

## Documentation philosophy

**The git log is the historical record. The docs are implementation-ready, not a paper trail.**

When editing or maintaining docs in this repo (especially the G6 dev-set under `docs/development/`), follow these rules:

1. **No dated "fixed/resolved/verified on YYYY-MM-DD" parentheticals in spec body.** The commit that landed the change already records who, when, and why. If a reader needs that audit trail, they run `git blame` or `git log <file>`.

2. **No strike-through "~~old text~~ — Fixed YYYY-MM-DD" entries in spec or open-issues files.** Once an issue is resolved, **delete the entry entirely**. The git log preserves the resolved-issue text and the resolution; the doc-as-of-today does not need to carry that load.

3. **No "Prior spec said X; that was wrong" historical notes inside the spec body.** State the current truth. The diff log shows what changed.

4. **No "History & Reconciliation" sections** unless they carry forward-looking information (e.g. unresolved migration decisions). Pure audit-trail prose belongs in commit messages.

5. **TODOs and known limitations DO belong in the doc** — they're forward-looking. Examples: "UNTESTED end-to-end pending firmware bring-up", "Draft — design-review needed", "Open Questions / TBDs" sections with *currently open* items only.

6. **Open-issues meta-docs** (like `docs/development/g6_docs-open-issues.md`) should contain *only* genuinely open items. Resolved items get deleted. When the list is empty, delete the file.

7. **Status banners at the top of spec files** are OK: "Status: Draft / Specified / Teaser / Stub" with the dimension that's load-bearing for implementers. No "Last reviewed: …" dates — `git log -1 <file>` answers that.

8. **Provenance lines** ("Source: G6 panels protocol v1 proposal, Google Doc XYZ") are OK because the implementer benefits from knowing where the content came from for further context.

9. **Cross-references between docs** (and between docs and code) should be sharp file:line links, not narrative descriptions of what was done.

The goal: a fresh reader (or a future LLM session) can open any spec doc and have everything they need to implement against it, with zero archeology required.

## Repo layout

- `docs/development/` — G6 development spec docs (Phase 1). Excluded from Jekyll. Will distill into 2–3 public-facing pages at Phase 2.
- `docs/` (root) — public Jekyll site pages (Phase 2 lives here).
- `Generation 6/` — production work. Contains the maDisplayTools (host MATLAB) and webDisplayTools (host JS) submodules, plus arena/panel hardware submodules.
- `Generation 2..5/` — historical generations. Treat as read-only references.
- `.codex-review/`, `.kicad-review/` — scratch dirs for review-skill artifacts. Gitignored.

## Submodules

- The G6 hardware repos (`Generation 6/Arena`, `Generation 6/Panels`, `Generation 6/Hardware`) use SSH URLs and may not initialize cleanly without SSH host-key trust set up. The `kicad-design-review` skill can pull from GitHub directly via `gh api` as a workaround.
- The `maDisplayTools` and `webDisplayTools` submodules use HTTPS and initialize fine.
- When committing changes that touch submodules: commit the submodule first (in its own repo), then commit the parent with the submodule pointer bump in the same commit as any related parent-repo edits.
