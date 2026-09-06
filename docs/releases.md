# Building and publishing releases

The workflows retain the upstream Sparkle build matrix and native-dependency preparation, with KokoroBox-specific artifact validation and publication.

## Outputs

| Platform | Architectures                  | Packages                       |
| -------- | ------------------------------ | ------------------------------ |
| Windows  | x64, ARM64                     | NSIS `.exe`, portable `.7z`    |
| macOS    | Intel x64, Apple Silicon ARM64 | `.pkg`                         |
| Linux    | x64, ARM64                     | `.deb`, `.rpm`, `.pkg.tar.zst` |

Each release must contain all 12 packages, `latest.yml`, and `SHA256SUMS`. The updater metadata preserves the exact release tag, including a leading `v` when present. Build artifacts remain available in the workflow run for 14 days.

All targets use GitHub-hosted runners and the locked project dependencies. The native module for each target architecture is checked before packaging.

Linux retains the internal `/opt/sparkle/sparkle` executable and service identifiers for compatibility with the existing installer and service scripts. The shared `pnpm build:linux` packaging entry point sets this installation path for both local and CI builds. The desktop display name remains KokoroBox.

### RPM compatibility

The RPM dependency declarations target openSUSE, Fedora, and Rocky Linux using shared-library SONAME capabilities instead of distribution-specific library package names. Both x86_64 and aarch64 use RPM's `(64bit)` capability suffix. This includes `libgbm.so.1`, which Electron needs directly but Fedora may install only as a transitive dependency. `xdg-utils` and `at-spi2-core` remain package dependencies because they supply runtime tools and services.

Install with `sudo zypper install ./package.rpm` on openSUSE or `sudo dnf install ./package.rpm` on Fedora/Rocky Linux so the package manager resolves dependencies.

Fedora 43 and 44 are the first runtime validation targets. The reusable build workflow tests the actual x86_64 release RPM on both versions, and a failure blocks publication. Each disposable Fedora container installs the RPM with DNF, checks ELF linkage before installing test tools, checks launcher/desktop/sandbox permissions, starts both bundled Mihomo cores, verifies the packaged renderer and preload/main-process IPC under Xvfb as a regular user, then removes the package and checks cleanup.

On 2026-09-06, the locally built `2.26.9-6` x86_64 RPM passed these checks on both Fedora 43 and 44. ARM64 RPMs are still built and published, but Fedora ARM64 runtime validation is currently disabled because the native-runner smoke tests exceed the 20-minute job limit. To reproduce the x86_64 checks with Docker (or substitute Podman):

```sh
docker run --rm --shm-size=256m \
  -v "$PWD/dist:/packages:ro" -v "$PWD/scripts:/checks:ro" \
  registry.fedoraproject.org/fedora:44 \
  bash /checks/check-fedora-rpm.sh /packages/kokorobox-desktop-linux-2.26.9-6-x86_64.rpm
```

The container smoke test uses X11 and disables Chromium's sandbox and GPU acceleration only for that test process. It does not certify Wayland, hardware rendering, desktop sandbox/SELinux policy, credential storage with a real keyring, or the privileged service/TUN flow; verify those in a Fedora desktop VM or on hardware. The bundled x64 Mihomo and service binaries require an x86-64-v3 CPU.

The reusable build also installs and runs the x86_64 RPM in the official openSUSE Tumbleweed container. This gate uses Zypper and performs the same package metadata, linkage, bundled-core, renderer/IPC, and removal checks as Fedora. openSUSE ARM64 is not included in the runtime gate.

Rocky Linux retains compatible dependency declarations but is not yet covered by a runtime gate. Before declaring specific releases supported, check the final RPM with `rpm -qpR ./package.rpm` and test installation and desktop functionality. In particular, compare the bundled Electron and native module's GLIBC/GLIBCXX requirements with older Rocky Linux releases.

## First-time setup

1. Push the workflow changes to the repository's `master` branch.
2. Open **Actions** on GitHub and enable workflows if GitHub has disabled them for the fork.
3. Ensure repository/organization Actions policies permit the referenced actions and GitHub-hosted runners. Publication needs `contents: write`; the workflows grant this only to publishing jobs.
4. Configure the seven Apple signing/notarization secrets listed below. They are required for the macOS portion of every release. GitHub supplies `GITHUB_TOKEN` automatically.

The local Apple Keychain is not available on hosted runners. Do not upload certificates or private keys to Git. No AUR key, translation API key, or SignPath token is required by this pipeline.

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
- macOS packages additionally require a matching verification receipt written only after signing, notarization, stapling, and Gatekeeper checks succeed. A missing or stale receipt blocks staging/publication.
- `Publish Packages` rejects missing, empty, modified, stale, wrong-version, or wrong-commit artifacts before uploading anything.
- Platform jobs use `fail-fast: false` so a failed target does not cancel other builds, but any failed target blocks publication of the entire release.
- Release notes are generated from Git commit subjects without an external translation service. Template headings and download/signing information are English; commit subjects retain their original language.
- `SHA256SUMS` is calculated from the final package bytes. It detects corruption but does not authenticate the publisher.

Run the local checks with:

```sh
pnpm test:release
pnpm test:macos-signing
pnpm test:kokoro
pnpm test:localization
pnpm typecheck
```

For environments that restrict the `tsx` CLI's IPC socket, the equivalent test invocation is:

```sh
node --import tsx --test scripts/test-release.ts scripts/test-macos-signing.ts scripts/test-kokoro-auth.ts scripts/test-localization.ts
```

## Signing status

Windows CI packages are currently **not Authenticode-signed**. SignPath signing must be configured after project approval; this workflow does not claim Foundation sponsorship or signed Windows releases.

Windows packages build the small elevation runner from the reviewed Go source in `build/windows/runner`; release builds never download the legacy Sparkle-branded runner. The installed executable, shortcuts, auto-start task, and elevation task use KokoroBox names. On the first upgraded launch, the app migrates an enabled legacy `sparkle` auto-start task to `KokoroBox` and removes obsolete scheduled tasks and runner files. Internal data, service, IPC, and legacy URI identifiers retain their Sparkle names where changing them would break existing installations or the bundled service protocol.

Both Intel and Apple Silicon macOS releases require **Developer ID-signed, Apple-notarized PKGs with stapled tickets**. There is no unsigned fallback in either Stable or Rolling releases. The upstream PKG installation scripts remain enabled for proxy/service operation.

`electron-builder.ci.yml` is retained only for unsigned local smoke tests; release workflows no longer use it. The normal `electron-builder.yml` remains available for local production signing.

### Apple repository secrets

In **Settings → Secrets and variables → Actions**, configure:

| Secret                        | Value                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| `CSC_LINK`                    | Base64-encoded Developer ID Application `.p12`, including its private key |
| `CSC_KEY_PASSWORD`            | Application `.p12` export password                                        |
| `CSC_INSTALLER_LINK`          | Base64-encoded Developer ID Installer `.p12`, including its private key   |
| `CSC_INSTALLER_KEY_PASSWORD`  | Installer `.p12` export password                                          |
| `APPLE_ID`                    | Apple ID with access to the developer team                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password, not the account's normal password            |
| `APPLE_TEAM_ID`               | Ten-character developer Team ID matching both certificates                |

Certificate secrets must contain Base64 data, not URLs or local file paths. Both export passwords must be non-empty. An existing local `notarytool` Keychain profile is not copied to GitHub; the workflow creates its own temporary profile.

### Credential isolation and signing sequence

The release callers explicitly forward only these seven secrets to the reusable Build workflow. Only the macOS signing step receives their values. Compilation, dependency installation, Windows/Linux builds, and publication do not receive the Apple credentials in their environments.

Signing is restricted to this repository's `master` branch or stable SemVer tags (including numeric revision suffixes such as `2.26.9-1`), via push, manual dispatch, or schedule on GitHub-hosted runners. External PRs, rolling tags and arbitrary branch refs are not accepted. Protect `master`, release tags, and workflow changes with appropriate review rules. Repository secrets still require trusting users who can change workflows; consider a protected GitHub environment with required reviewers for stronger release approval controls.

`scripts/macos-signing.ts`:

1. Checks every required secret and creates a private temporary directory and Keychain under `RUNNER_TEMP`.
2. Imports both certificates, authorizes Apple signing tools, and validates notarization credentials in a temporary Keychain profile.
3. Packages the already compiled app using `forceCodeSigning: true`, the specified team, hardened runtime, and explicit signing of both Mihomo binaries and `sparkle-service`.
4. Verifies the app/helpers' Developer ID identity, team, hardened runtime, timestamp, and signatures, plus the Installer signature on the PKG.
5. Submits the **final signed PKG** using `notarytool`, waiting up to 45 minutes for `Accepted`. Automatic electron-builder notarization is disabled in this generated configuration to avoid duplicate or silently skipped submissions.
6. Staples the PKG ticket, runs `stapler validate`, assesses the installer with Gatekeeper, and rechecks its package signature.
7. Writes a verification receipt containing the final post-stapling checksum and submission ID. Artifact staging and collection verify that it matches the version, commit, filename, and bytes.
8. Restores the original Keychain search list and removes the temporary Keychain, certificate files, and temporary configuration. An additional `always()` step handles cancellation/failure cleanup when possible; hosted runner disposal is the final isolation boundary.

Child packaging processes do not inherit certificate blobs or Apple authentication passwords. Raw signing command errors are not printed because process errors can include secret-bearing arguments. Logs identify the failed step without dumping credentials.

### Troubleshooting

- **Missing GitHub Secret**: check the exact secret names and their availability to this repository/workflow.
- **Import application/installer certificate failed**: check Base64 encoding, the matching export password, and that the `.p12` includes the private key.
- **Validate Apple notarization credentials failed**: check the app-specific password and membership of the specified team; an Apple account password is not accepted.
- **Sign App and PKG failed**: check that the certificates are valid Developer ID Application/Installer certificates for the same team, not development or App Store certificates.
- **Notarization or Gatekeeper failure**: publication stops. Fix the signing/notarization issue before retrying; never bypass the check to ship an unsigned artifact.
- **Notarization timeout**: Apple may continue processing after the runner stops waiting. No release artifact is staged without a completed verification receipt. Investigate the submission before retrying to avoid unnecessary duplicate submissions.

The signing tests use fake credentials and mocked Apple commands. Passing them verifies orchestration and failure handling, not the validity of repository secrets or Apple's acceptance of a real package.

Real runner builds and installation checks on Windows, macOS, and Linux are still required after pushing workflow changes; local workflow/unit checks alone do not verify these OS behaviors.
