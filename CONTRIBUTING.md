# Contributing to Sentinel

Thanks for working on Sentinel. This page covers how changes get in: branches, commit messages and pull requests. Everything else a developer needs is in the docs:

- [Set up for development](docs/development/setup.md): tools, first-time set-up and the dev loop.
- [Find your way around the code](docs/development/code-map.md)
- [Run tests and quality checks](docs/development/testing.md): every check CI runs, and the 100% coverage rule.
- [How to…](docs/development/how-to.md) add a setting, a section, a decoder or a map control, and ship a frontend change.
- [How it works](docs/architecture/overview.md)

Never commit a `.env` file or any secret.

## Branches

- **Never commit to `main`.** Branch off the latest `main` for every change, however small.
- Name the branch after the kind of change: `type/short-kebab-description`, such as `feat/sdr-scanner`, `fix/adsb-filter-flash` or `docs/contributing`.
- One logical change per branch.

## Commits

Sentinel uses [Conventional Commits](https://www.conventionalcommits.org). The changelog is written from them automatically, so a vague message becomes a vague changelog line.

```text
type(scope): short imperative subject

optional body explaining why
```

| Type | Changelog heading | Use for |
|---|---|---|
| `feat` | Features | Something new a user can do |
| `fix` | Bug Fixes | A bug fix |
| `perf` | Performance | Faster or lighter, same behaviour |
| `refactor` | Refactoring | Restructuring with no change in behaviour |
| `docs` | Documentation | Docs only |
| `test` | Tests | Adding or fixing tests |
| `build` | Build System | Build, tooling and dependency mechanics, including rebuilding `frontend/spa-dist/` |
| `ci` | Continuous Integration | CI workflows |
| `style` | Styling | Formatting only |
| `chore` | Chores | Other maintenance (`chore(deps)` goes under Dependencies) |
| `revert` | Reverts | Undoing an earlier commit |

The mapping lives in [`cliff.toml`](cliff.toml).

- Keep each commit to **one logical change**. Don't fold an unrelated refactor into a feature.
- Write the subject in the **imperative**: "add", not "added" or "adds".
- Mark a breaking change with `!` after the type or scope (`feat!:`), or a `BREAKING CHANGE:` footer.
- A frontend change and its rebuilt `frontend/spa-dist/` go in separate commits: the change first, then `build(spa): …`.

## Pull requests

1. **Keep it focused**: one change per pull request. Small ones are reviewed faster and are easier to revert.
2. **Run the checks** in [Run tests and quality checks](docs/development/testing.md) first, including the browser tests for any UI change.
3. **Read your own diff** as a reviewer would before you ask anyone else to.
4. **Open it against `main`**, with a description that says what changed, why, how you tested it, and any breaking change. Add screenshots for UI changes.
5. **Every CI check must pass**, and new frontend code must be at 100% coverage.

The **changelog updates itself.** After each merge to `main`, a GitHub Action (`.github/workflows/changelog.yml`, using git-cliff) rewrites `CHANGELOG.md` from the commits and commits it to `main`. It never touches your branch. Don't edit `CHANGELOG.md` by hand.
