# Kokoro client authentication

KokoroBox uses the public API at `https://amamiyakoko.ro/api` and the exact redirect URI `kokoro://oauth/callback`. This URI is the shared backend contract for Android, iOS, Windows, macOS and Linux. This repository implements the Electron desktop client (Windows, macOS and Linux); it contains no Android or iOS application.

PKCE **S256 is mandatory**. There is no `plain`, omitted-verifier, legacy-token or platform-specific callback fallback. No `API_SECRET`, `APP_AUTH_SECRET` or `OSU_CLIENT_SECRET` belongs in the client.

## Login lifecycle

1. The main process generates **two independent 32-byte CSPRNG values**, encoded as Base64URL without padding: `state` and `code_verifier`. The verifier is 43 characters; accepted verifier syntax is 43–128 characters from `A-Z a-z 0-9 - . _ ~`.
2. Compute `BASE64URL_NO_PADDING(SHA256(ASCII(code_verifier)))`. Hash the verifier string, not the decoded random bytes or a hex digest. Production values are generated afresh; the RFC 7636 example is only a test fixture.
3. Retain `{state, codeVerifier, redirectUri, expiresAt}` privately in the main process for five minutes. Only one pending login or code exchange is allowed. A second login must wait or explicitly cancel the first.
4. Use Electron `shell.openExternal` to open the system browser with a URL built through `URL` / `URLSearchParams`:

   ```text
   GET /app/auth/login
     ?redirect_uri=kokoro%3A%2F%2Foauth%2Fcallback
     &state=<state>
     &code_challenge=<S256-challenge>
     &code_challenge_method=S256
   ```

5. Accept only the exact raw callback base `kokoro://oauth/callback`, with query parameters. Reject other schemes/hosts/paths, ports (including an empty port), userinfo, fragments (including an empty fragment), control characters, normalized path aliases, and duplicate decoded query keys. Require a nonempty matching state; compare equal-length state bytes with `timingSafeEqual`.
6. Consume matching pending state **before any asynchronous exchange**. A successful callback requires nonempty `code`; `error=access_denied` cancels login. Reject ambiguous code-plus-error callbacks. Unknown/missing state and forged URLs cannot evict a legitimate pending login, but are never exchanged. Consumed, expired and unsolicited callbacks are rejected.
7. Submit JSON to `POST /app/auth/token`:

   ```json
   {
     "grant_type": "authorization_code",
     "code": "<callback-code>",
     "redirect_uri": "kokoro://oauth/callback",
     "code_verifier": "<original-verifier-for-this-state>"
   }
   ```

8. Validate the Bearer token response and save `access_token`, `refresh_token`, `expires_in` and `refresh_expires_in` as one encrypted credential record before publishing the new session. Do not parse opaque tokens.

The backend authorization code expires after five minutes and is single-use. A missing verifier is HTTP 400; invalid verifier syntax is 422; mismatched, expired or already-used codes are 400. Code exchange is never automatically retried, even for a timeout with an uncertain outcome. All these failures require a fresh login, with fresh random values and S256.

Pending data is released on success, provider denial, explicit cancellation, timeout, browser-launch failure or a terminal exchange failure. Closing the subscription dialog cancels its pending login; the waiting screen also has a Cancel button. Merely closing a browser tab cannot be detected by `openExternal`: use Cancel or wait for the five-minute expiry. Cancelling or logging out during an in-flight exchange prevents its eventual response from restoring a session.

## Desktop callback delivery

- `electron-builder.yml` includes the `kokoro` protocol for packaged apps and the Linux desktop MIME handler. `initDeeplink` retains runtime/default-handler registration, including Windows and development launches.
- macOS `open-url` calls `preventDefault` and queues callbacks received before initialization. Windows/Linux command-line delivery scans all arguments, not just the last one.
- The Electron single-instance lock is acquired **before Windows elevation or startup side effects**. A normal secondary launch hands its arguments to the original app instance; that instance owns the verifier.
- Windows may isolate Electron's single-instance channel when the original app is elevated and the browser callback process is not. In that case, the callback process connects only to an ephemeral `127.0.0.1` relay advertised by the original instance. It sends a random nonce first and requires an HMAC proof derived from the pending state before sending the callback. The endpoint file contains only a random instance ID and loopback port; the callback, code, state and verifier are never persisted by the relay.
- Callbacks wait until initialization and window creation complete. OAuth arguments are removed from the primary process's `argv` before elevation/relaunch helpers can serialize them to a temporary file or shell command.
- Pending logins are intentionally not persisted. If the original process has exited or restarted, the verifier is lost: a cold-start callback is rejected and the user must start a new login. An elevated cold launch likewise cannot recover the lost verifier. No authorization code is forwarded into an elevation helper as a recovery mechanism.

## Token storage and refresh

The existing Electron `safeStorage` encryption is retained (the OS-backed secure-storage abstraction). Linux without a secure keyring, including the `basic_text` backend, fails closed. The encrypted envelope contains both tokens and their absolute expiries. Writes are serialized, use a mode-0600 temporary file beside the destination, and rename over the destination without first deleting the old record. JSON/decryption errors never return decrypted input to the renderer.

Refresh remains:

```json
{ "grant_type": "refresh_token", "refresh_token": "<current-refresh-token>" }
```

No verifier is sent for refresh. Concurrent requests share one refresh and await the complete credential replacement before proceeding. An access-protected request may refresh after its first 401 and replay once; refresh 401 clears the session. Explicit logout invalidates pending exchanges and clears credentials even when server revocation fails. Existing profile-cache cleanup remains in the logout IPC handler.

## Sensitive-data boundaries

The renderer receives session/account data without `proxy_uuid`, not tokens or the verifier. Authentication HTTP uses a dedicated Axios instance with redirects disabled; it does not inherit shared-instance interceptors. Transport messages and response bodies are not forwarded into errors, notifications or IPC because they may reflect credentials. Token endpoints are never retried through a legacy flow. The authentication path has no analytics or crash-reporting instrumentation.

Do not log or report verifier values, authorization codes, tokens, full callback URLs, token request bodies, UUIDs or full external subscription URLs. Any future HTTP/crash instrumentation must preserve this boundary. OS process arguments and the external browser necessarily carry the callback or login URL during delivery; application code must not copy these into diagnostics. Avoid screenshots or terminal commands containing real credentials.

## Verification

```bash
pnpm test:kokoro
pnpm test:localization
pnpm typecheck
pnpm exec electron-vite build
```

OAuth tests exercise the actual client with mocked HTTP, Electron, clock and secure-storage boundaries. Coverage includes the RFC vector, random independence, URL/body contracts, state validation/expiry, callback spoofing/duplicates/replay, provider denial/cancel, browser failure, lost verifier/cold process, concurrent logins, 400/422 fail-closed behavior, cancellation during exchange/storage, single-flight refresh, token persistence ordering, 401 replay limits, and desktop delivery queue/packaging declarations.

Automated callback simulations and package declaration checks **do not establish OS registration or delivery correctness on a real installation**. Before release, manually verify on installed macOS, Windows and Linux builds:

- System browser → osu! → app return while running, minimized or without a window.
- OS scheme association and secondary-process handoff, especially Windows elevation/service modes and Linux desktop environments.
- App exit/restart during authorization rejects the old callback and permits a fresh login.
- Provider denial, dialog cancellation, five-minute timeout and replay rejection.
- End-to-end S256 exchange against the deployed backend, secure-store persistence across restart, refresh rotation and logout.

The application build command compiles main, preload and renderer code; it does not create or sign a new installation package, nor perform any real-account OAuth or native callback test.
