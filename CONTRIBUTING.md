# Contributing

Thanks for helping. The bar for every change is the project's one rule: **facts come from code, judgment from the
model.** If a feature needs a model to state something that code could check, build the check.

## Before you open a PR

```sh
pnpm install && pnpm exec tsc --noEmit
cd src-tauri && cargo clippy --release -- -D warnings && cargo test
python3 src-tauri/code/validate.py          # only needed if you touched src-tauri/code
```

CI runs the same steps on macOS. The live tests (`cargo test -- --ignored`) need Ollama, a JDK, Docker or n8n
running locally, so CI doesn't run them. If your change touches one of those integrations, run them yourself.

## Adding a CODE problem

1. Read [src-tauri/code/AUTHORING.md](src-tauri/code/AUTHORING.md) and the two worked examples it points to.
2. Write `problem.json`, `Ref.java` and `Cases.java` in `src-tauri/code/problems/<id>/`.
3. Run `python3 src-tauri/code/validate.py <id>` until it prints `ok`, then once more. Benchmark slopes are noisy,
   and a problem that only passes sometimes is a broken problem.

Write the statement in your own words. Don't copy text from LeetCode or any other site.

## Adding a drill

Add `src-tauri/code/drills/<id>.java` (a `public class Main` with deterministic output) and an entry in
`drills/drills.json`. Paste in the **exact** output from running it; never write it down from memory.
`validate.py --drills` checks this.

## Shortcuts and commands

If you add or change a shortcut, launcher key, deep link or maintenance command, update `src/cheatsheet.json` in the
same change. It drives the `?` overlay and `docs/CHEATSHEET.md`.

## Style

- Rust: `cargo fmt` and clippy-clean. Errors are user-facing sentences: say what happened and what to do.
- TypeScript: strict, no `any`. Keep the comment density of the file you're editing.
- Nothing that posts, sends, applies or spends may run without an explicit approval click.
