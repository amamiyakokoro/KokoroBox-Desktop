# KokoroBox-Desktop Privacy Policy

Last updated: 2026-09-08

KokoroBox-Desktop is a desktop client for Mihomo. This policy explains the
data handled by the application itself. It does not govern the practices of
your subscription provider, selected proxy servers, DNS providers, WebDAV
provider, GitHub, osu!, or any other service you choose to use with
KokoroBox.

## Summary

KokoroBox does not include advertising, analytics, telemetry, or automatic
crash-report upload. It does not operate a general-purpose KokoroBox account
or traffic collection service. Most configuration and operational data stays
on your device unless you enable a feature that communicates with a service,
or route traffic through a proxy or DNS server.

## Data stored on your device

KokoroBox stores its application data in the operating system's application
data directory (or in its portable `data` directory when portable mode is in
use). Depending on the features you use, this can include:

- application preferences, display settings, update settings, and local logs;
- Mihomo configuration, profiles, subscription URLs, overrides, rule data,
  DNS settings, and downloaded resources;
- selected application-routing rules. On Windows these include selected
  executable paths; on macOS they include application signing identifiers and
  may include an application path, display name, and cached icon;
- optional GitHub token, Gist age identity, and WebDAV endpoint, username, and
  password in the application configuration; and
- an owner-restricted local key pair used to authenticate requests to the
  local KokoroBox privileged service.

Profiles, subscription URLs, proxy configuration, and logs can contain
sensitive information, including credentials or identifiers supplied by your
provider. The optional GitHub and WebDAV credentials described above are part
of the local configuration and may be included in a WebDAV backup. They are
not separately encrypted by KokoroBox. Protect your operating-system account,
portable data directory, and backups accordingly.

Kokoro OAuth access and refresh tokens are handled differently: they are
stored using Electron `safeStorage`, which uses operating-system secure
storage where available. KokoroBox refuses to save these credentials if secure
storage is unavailable; on Linux it also refuses the `basic_text` fallback.

Log retention is configurable. Deleting a profile, clearing settings, signing
out of Kokoro, or removing the KokoroBox application data can remove relevant
local data. Sign-out removes the locally stored Kokoro credentials. Deleting
local data does not delete copies already sent to a service you selected, such
as a WebDAV server, GitHub Gist, subscription provider, proxy, or DNS
provider.

## Network connections you control

KokoroBox makes network requests only to provide the features you configure or
use. These can include:

- **Kokoro subscriptions.** If you choose to sign in, KokoroBox opens the
  system browser for osu! OAuth and exchanges the returned authorization code
  with the Kokoro API over HTTPS. The app sends the selected subscription
  options and a User-Agent in the form `KokoroBox-Windows/<version>`,
  `KokoroBox-macOS/<version>`, or `KokoroBox-Linux/<version>` when retrieving
  a Kokoro subscription. OAuth tokens are sent only to the Kokoro API for the
  authenticated actions that require them.
- **Updates and bundled resources.** If update checking is enabled, or when
  you explicitly download an update, KokoroBox contacts GitHub Releases and
  the GitHub API. Update requests necessarily disclose ordinary connection
  data, such as your IP address, to GitHub. Downloaded rule, GeoIP, theme, or
  external UI resources contact their configured source.
- **Profiles, overrides, and DNS.** Remote profile or override updates contact
  the URLs you add. DNS requests are sent to the DNS servers in your Mihomo
  configuration and use the connection rules you configure.
- **Optional backup and sync.** WebDAV backup/restore and GitHub Gist sync run
  only after you configure and use them. A WebDAV backup contains the listed
  KokoroBox configuration and profile data; it is not end-to-end encrypted by
  KokoroBox.
- **Proxy traffic.** Mihomo sends network traffic according to your selected
  proxy, routing, DNS, TUN, and system-proxy configuration. The selected
  proxy server and relevant network providers can observe information needed
  to carry that traffic. KokoroBox does not turn a Direct connection into a
  Kokoro-operated service.

## Application routing and system permissions

Application routing is opt-in. On Windows it uses a local privileged service,
WinDivert, and a controlled ProxyBridge-based sidecar. On macOS it uses an
opt-in Network Extension. These components inspect and route traffic locally
for only the applications and protocols you select. Proxy actions send that
traffic to a loopback-only Mihomo SOCKS listener; Direct and Block actions are
handled locally. The feature does not create a separate KokoroBox remote
collector.

Windows may ask for administrator privileges, and macOS may ask you to approve
the System Extension. You can disable application routing and remove its rules
in KokoroBox. Operating-system permission records and extension state are
managed by the operating system.

## Data we do not intentionally collect

KokoroBox does not include built-in analytics, advertising identifiers,
telemetry, or automatic upload of logs, profiles, subscription URLs, OAuth
tokens, DNS queries, or proxied traffic to KokoroBox developers. We also do
not use the contents of selected applications for advertising or profiling.

When asking for support, do not attach full logs, profile files, subscription
URLs, OAuth callback URLs, tokens, private keys, or WebDAV credentials unless
you have independently removed sensitive values and understand the impact of
sharing them.

## Security

KokoroBox uses operating-system protections where available and communicates
with the Kokoro API over HTTPS. However, no desktop application, local device,
or network transport is completely secure. In particular, user-supplied HTTP
URLs, third-party proxy servers, DNS servers, and unencrypted backups have
security and privacy properties outside KokoroBox's control.

## Changes and contact

We may update this policy when KokoroBox data practices change. The current
version is published in this repository. For questions or to report a privacy
issue, open a private security report where available or use the
[KokoroBox-Desktop issue tracker](https://github.com/amamiyakokoro/KokoroBox-Desktop/issues)
without posting sensitive information.
