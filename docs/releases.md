# Building and publishing releases

The workflows retain the upstream Sparkle build matrix and native-dependency preparation, with KokoroBox-specific artifact validation and publication.

## Outputs

| Platform | Architectures                  | Packages                       |
| -------- | ------------------------------ | ------------------------------ |
| Windows  | x64, ARM64                     | NSIS `.exe`, portable `.7z`    |
| macOS    | Intel x64, Apple Silicon ARM64 | `.pkg`                         |
| Linux    | x64, ARM64, LoongArch64        | `.deb`, `.rpm`, `.pkg.tar.zst` |

Each release must contain all 15 packages, `latest.yml`, and `SHA256SUMS`. The updater metadata preserves the exact release tag, including a leading `v` when present. Build artifacts remain available in the workflow run for 14 days.

All targets use GitHub-hosted runners. LoongArch64 retains the upstream community Electron 42.3.0 and `@loongdotjs/electron-builder` 26.15.6 adaptation; other targets use the locked project dependencies. The native module for each target architecture is checked before packaging.

Linux retains the internal `/opt/sparkle/sparkle` executable and service identifiers for compatibility with the existing installer and service scripts. The desktop display name remains KokoroBox.

## First-time setup

1. Push the workflow changes to the repository's `master` branch.
2. Open **Actions** on GitHub and enable workflows if GitHub has disabled them for the fork.
3. Ensure repository/organization Actions policies permit the referenced actions and GitHub-hosted runners. Publication needs `contents: write`; the workflows grant this only to publishing jobs.
4. No custom secret is required for unsigned builds. GitHub supplies `GITHUB_TOKEN` automatically.

The local Apple Keychain is not available on hosted runners. Do not upload certificates or private keys to Git. No AUR key, translation API key, Apple password, or SignPath token is required by this pipeline.

## Rolling prereleases

Push a code or workflow change to `master`, or select **Actions → Rolling → Run workflow**. Documentation-only pushes are ignored.

The pipeline builds a version such as `2.26.9-rolling-abcdef0` and publishes a prerelease at the fixed `rolling` tag. Its version is based on the greater of `package.json` and the highest merged stable version tag, then increments the patch component. All jobs receive the same version and source commit.

The rolling tag moves only after all new assets have uploaded successfully. Older KokoroBox package assets are then removed; existing assets are not deleted before replacement builds succeed. Automatic cancellation is disabled to avoid interrupting publication. GitHub may replace an older pending run with a newer pending run while one release is running.

There is no AUR publication from the Rolling workflow. The upstream AUR workflow is not part of this release pipeline.

## Stable releases

Choose either method:

- Push a version tag such as `v2.26.8` or `2.26.8`. The exact tag is used for the release and download URLs.
- Select **Actions → Release → Run workflow**. Set `version` (with or without `v`), or leave it empty to use `package.json`. The optional `tag` must be the same version, with or without `v`; the default is `v<version>`.

If the requested tag already exists, select that tag as the workflow's ref, or ensure the selected commit is exactly the tagged commit. A tag pointing to a different commit is rejected.

The workflow does not commit version changes back to `master`. It sets the package version only inside build workspaces, avoiding source changes between the tagged commit and the compiled application. Bump `package.json` separately when updating the development baseline.

Already published stable versions cannot be overwritten. For a failed upload that left a draft, retry from the same source ref and version. After checking the full matrix, the pipeline uploads to a draft release, verifies uploaded asset sizes, confirms the tag's commit, and only then publishes it as the latest stable release.

### Optional monthly releases

The upstream month-end schedule remains available but is disabled by default. Set the repository Actions variable `ENABLE_MONTHLY_RELEASE` to `true` to enable it.

The schedule runs at 12:00 Taipei time on potential month-end dates and filters out non-month-end runs. A delayed run on the following first day is accepted. It skips an unchanged source tree since the highest merged stable tag, uses a newer package version when available, or increments the patch component of the latest stable tag. If no stable tag exists, it uses the package version for the first release.

## Validation and failure handling

- `Build` runs release tests, OAuth tests, localization tests, and TypeScript checks before packaging.
- Each package is staged with its target, version, source commit, and SHA-256 checksum.
- `Publish Packages` rejects missing, empty, modified, stale, wrong-version, or wrong-commit artifacts before uploading anything.
- Platform jobs use `fail-fast: false` so a failed target does not cancel other builds, but any failed target blocks publication of the entire release.
- Release notes are generated from Git commit subjects without an external translation service. Template headings and download/signing information are English; commit subjects retain their original language.
- `SHA256SUMS` is calculated from the final package bytes. It detects corruption but does not authenticate the publisher.

Run the local checks with:

```sh
pnpm test:release
pnpm test:kokoro
pnpm test:localization
pnpm typecheck
```

For environments that restrict the `tsx` CLI's IPC socket, the equivalent test invocation is:

```sh
node --import tsx --test scripts/test-release.ts scripts/test-kokoro-auth.ts scripts/test-localization.ts
```

## Signing status

Windows CI packages are currently **not Authenticode-signed**. SignPath signing must be configured after project approval; this workflow does not claim Foundation sponsorship or signed Windows releases.

macOS CI uses `electron-builder.ci.yml` to disable certificate discovery/signing and notarization explicitly. The output is an **unsigned, non-notarized PKG**, while retaining the upstream installation scripts needed for proxy operation. The regular `electron-builder.yml` remains available for local production signing.

Apple signing/notarization on GitHub requires a separate, explicitly configured credential workflow. Do not describe hosted CI artifacts as equivalent to a locally signed or notarized package.

Real runner builds and installation checks on Windows, macOS, and Linux are still required after pushing workflow changes; local workflow/unit checks alone do not verify these OS behaviors.
