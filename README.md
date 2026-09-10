# Sampark

A responsive, one-to-one video calling app. Create a temporary link, send it to someone, and accept their request. No accounts or downloads.

Built with React 19.3, Vite 8, PeerJS, and plain CSS. The application deploys entirely as static files on Netlify; there are no API routes, server processes, or Netlify Functions.

## Local development

Use Node.js 24 LTS (22.12+ also works).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Camera and microphone access requires HTTPS in production; localhost is supported for development.

## Deploy to Netlify

Import this repository into Netlify. The included `netlify.toml` sets everything required:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `24`

No environment variables or backend deployment are required. Alternatively, run `npm run build` and upload `dist` through Netlify Drop. Call invitations use `?call=...` on the root page, so they work directly without routing rewrites. [Netlify’s Vite guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/).

## Calling

1. Enter your name (optional). Turn video off first if you want an audio-only call.
2. Select **Create call link** and allow your camera/microphone. Copy the link and share it with one person. Keep the tab open.
3. The guest opens the link, enters their name, and selects **Join call**. Accept their request to share media.
4. Toggle your mic or camera during the call. **Leave call** stops media tracks, closes connections, and expires your link. Create another link to call again.

Permission failures, unavailable devices, malformed or expired links, self-calls, offline state, cancelled setup, and unanswered calls show recovery messages. If the browser blocks audio playback, a button lets you start it manually. Names, links, and call history are not persisted by the application.

### Connection service and limitations

Frontend-only hosting still needs WebRTC signaling. Sampark uses the free public **PeerJS Cloud** service to introduce browsers; it replaces the previous dependency on a separate Socket.IO backend. Both people must be online, and links last for the current browser session. Calls are one-to-one and depend on that service being reachable. WebRTC encrypts media in transit; Sampark does not record it.

Some restrictive firewalls, VPNs, and symmetric NAT networks need a TURN relay. The app uses PeerJS’s default ICE configuration, which includes public STUN and TURN endpoints; no dedicated relay service or private relay credentials are configured. Public relay availability is not guaranteed, so some networks may not connect; the UI times out and suggests another connection. For production reliability across those networks, use a managed TURN provider with short-lived credentials. Never put a permanent secret in frontend environment variables. [PeerJS connection and TURN documentation](https://peerjs.com/client/faq).

## Checks

```sh
npm test
npm run build
```

For browser checks, start `npm run dev`, then run the following in another terminal. Google Chrome must be installed (or set `PLAYWRIGHT_CHANNEL` to an installed Playwright channel). Only synthetic media is used; these tests do not access your real camera or microphone.

```sh
npm run test:browser
# Also test a real two-tab call through PeerJS Cloud (requires internet):
LIVE_CALL_TEST=1 npm run test:browser
```

Set `APP_URL` if Vite uses a different port, for example `APP_URL=http://127.0.0.1:5174`. Browser checks cover responsive layout, permission denial, cancellation while a permission request is pending, invitation validation, and help. The optional live check also covers copying links, rejecting self-calls, decline/retry, accepting calls, device controls, hangup cleanup on both ends, and a second audio-only call. Screenshots are saved under the ignored `test-results/` directory.
