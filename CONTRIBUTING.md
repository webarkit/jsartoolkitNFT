# Contributing to jsartoolkitNFT

Thank you for your interest in contributing to `jsartoolkitNFT`! By following these guidelines, you help keep the project clean, organized, and easy to maintain.

## Pull Request Workflow

To contribute to the project, please follow these steps:

1. **Sync with the `dev` branch**: Ensure your local copy is up to date before starting new work.
   ```powershell
   git checkout dev
   git pull origin dev
   ```
2. **Create a new branch**: Create a descriptive branch starting from `dev`.
   ```powershell
   git checkout -b your-branch-name
   ```
3. **Develop and Test**: Make your changes and ensure they pass all tests (see the [Testing](#testing) section).
4. **Submit the Pull Request**: Open a PR against the `dev` branch of the main repository.

> **Important**: All PRs must be made against the `dev` branch. The `main` branch is reserved exclusively for stable releases.

## Testing

Before submitting a commit or a Pull Request, it is essential to verify that the code works correctly and adheres to the project's quality standards.

Run the following commands in the project root:

* **Run tests**:
  ```powershell
  npm run test
  ```
* **Check formatting**:
  ```powershell
  npm run format-check
  ```

If you add a new feature, make sure to include appropriate tests in `/tests` or as integration tests.

## Commit Message Conventions

To maintain a clean and automated release history, this project strictly adheres to the [Conventional Commits](https://www.conventionalcommits.org/) specification.

All Pull Requests will be squashed and merged. Please ensure your PR titles and commit messages follow this format:

`<type>(<optional scope>): <description>`

### 1. Allowed Types
* **`feat`**: A new feature or core algorithm implementation.
* **`fix`**: A bug fix.
* **`perf`**: A code change that improves performance.
* **`doc`**: Documentation-only changes.
* **`refactor`**: A code change that neither fixes a bug nor adds a feature (e.g., restructuring).
* **`test`**: Adding missing tests or correcting existing ones.
* **`style`**: Changes that do not affect the meaning of the code (formatting, missing semi-colons, etc.).
* **`chore`**: Changes to the build process, CI configuration, or auxiliary tools.

### 2. Project-Specific Scopes
To help us automatically categorize changes in our Changelog, please use one of the following scopes when applicable:
* **`simd`**: Manual vectorization or SIMD-specific optimizations (via -msimd128).
* **`wasm`**: WebAssembly and Emscripten target adjustments or optimizations.
* **`parallel`**: Concurrency implementations (e.g., pthread).

### 3. Examples
* `feat(simd): implement vectorized absolute difference`
* `perf(wasm): optimize memory allocation for emscripten builds`
* `fix(core): resolve out-of-bounds error in matrix transpose`
* `doc: update README with parallel execution benchmarks`

If your PR introduces a breaking change, please include `BREAKING CHANGE:` in the footer or append a `!` after the type/scope (e.g., `feat(core)!: change Matrix internal layout`).

## Creating Issues

Before creating a new issue, please search the [existing issues](https://github.com/webarkit/jsartoolkitNFT/issues) to see if it has already been reported.

When creating an issue, please provide as much information as possible:
* **For Bug Reports**: Include a clear description of the bug, steps to reproduce it, the expected behavior, and any relevant error messages or logs.
* **For Feature Requests**: Explain the purpose of the feature, why it is needed, and how it should work.

## Reporting Bugs and Feature Requests

If you encounter a bug or have an idea for a new feature, we invite you to open an [Issue](https://github.com/webarkit/jsartoolkitNFT/issues). Please be as detailed as possible in the description to help us resolve the issue quickly.

## Code of Conduct

We adopt the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md) to promote an inclusive and respectful environment for all contributors.
