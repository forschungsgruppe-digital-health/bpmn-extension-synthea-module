# Agent skills

This directory is the **single source** for the repository's agent skills: each
`skills/<name>/SKILL.md` has YAML frontmatter (`name`, `description`) and Markdown instructions.
An agent loads a skill when the task matches its `description`. The same layout is used in the
sister repositories `bpmn-extension-medical-terminology` and `bpmn-js-clinical-semantics`.

| Skill | When it applies | Gate |
|---|---|---|
| [`bpmn-conformance`](bpmn-conformance/SKILL.md) | checking or changing a `.bpmn` file or the extension | `npm run validate`, `npm run lint:invalid` |
| [`moddle-extension-review`](moddle-extension-review/SKILL.md) | changing `extension/model/synthea.json` | `npm run roundtrip` |

## How the tools find them

- **Claude Code**: through the symlink `.claude/skills` → `../skills`.
- **OpenAI Codex** and **GitHub Copilot**: through the symlink `.agents/skills` → `../skills`.
- **Cursor and other readers of `AGENTS.md`**: the section "Agent skills" in the root
  [`AGENTS.md`](../AGENTS.md) lists the same skills.

## Editing rule

Change a skill only in `skills/<name>/SKILL.md`. The symlinks and `AGENTS.md` point here and never
copy a skill's text. On Windows, check out with symlinks enabled (`git config core.symlinks true`),
or the two links arrive as plain text files.
