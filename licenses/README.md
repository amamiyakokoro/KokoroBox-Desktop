# Supplemental licenses

This is the repository's central directory for tracked third-party license files.
Its relative layout is preserved in the installed `licenses/` directory. Generated
npm notices and build-supplied native notices are added to the same directory.

Native licenses come from the exact artifacts prepared for each build:

- ProxyBridge / WinDivert: `extra/files/process-router/LICENSE.*` (Windows).
- ProxyBridge: `extra/files/macos-app-routing/LICENSE.ProxyBridge` (macOS).
- Sparkle: `extra/macos-updater/LICENSE.Sparkle` (macOS).

These staging directories and `out/licenses/` are generated and ignored by Git;
their files are available after preparation/build, not as repository links.
The circle-flags license mirrors the original asset directory's license at
revision `379588b5da95482d6bbf10bd45644a35b0609ea6`.

Production builds generate `out/licenses/{main,preload,renderer}.txt` from
bundled module paths and installed runtime dependency trees. License, COPYING,
NOTICE, and copyright files are preserved, including full licenses embedded in
README files. Missing required dependencies or license texts fail the build.
Build-time-only tools are not listed unless included in a runtime dependency tree.

Version-specific supplements cover npm packages that omit license texts.
Each supplement records its source; review it again when that package changes
version. `byte-length` publishes only an MIT declaration and author metadata;
its supplement documents that limitation and reproduces the standard MIT terms.

The `icons` directory contains notices for the icon sets used through
react-icons 5.7.0. Sources identify release versions where available. Lucide,
Ant Design and Boxicons notices use the recorded upstream revisions; their
attributions supplement the package's own notices. Icons are converted to React
components by react-icons; KokoroBox uses them at application-selected sizes and
colors. Font Awesome and Typicons artwork retains its Creative Commons license.

The bundled `twemoji.ttf` identifies itself as Twemoji Mozilla. It is obtained
from https://github.com/Sav22999/emoji/tree/master/font without local edits.
Its upstream code and artwork notices are in `LICENSE.Twemoji`; full Apache and
Creative Commons terms are included alongside it.

electron-builder copies generated notices and this directory into `resources/licenses`,
including Linux system-core packages. Electron/Chromium and native binary bundles
retain their separately supplied license files; this npm collector does not
inspect dependencies compiled inside native binaries.
