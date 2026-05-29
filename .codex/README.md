# Codex Entry Point

This directory is the project-local entry point for Codex-oriented agent
routing. It is intentionally small; the authoritative instructions remain in
`AGENTS.md`.

## Startup Order

1. Read `AGENTS.md`.
2. Read `.agents/routing.yaml`.
3. Pick the primary role for the task.
4. Read the selected `.agents/roles/*.md` file.
5. Load only the scope-specific docs needed by that role.

## Delegation Rule

Use multiple agents only when the user or runtime explicitly allows delegation.
Otherwise, apply the selected role locally. If multiple agents are used, every
code-editing agent needs a disjoint write set and must not revert changes made
by others.

## Default For TLT

Most feature work should start with `functional_accuracy`. UI/layout work starts
with `frontend_ui_proof`. Formula and cable-selection work starts with
`formula_oracle`. Release verification starts with `qa_regression`.
