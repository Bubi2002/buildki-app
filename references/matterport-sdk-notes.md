# Matterport SDK Integration Notes

## Key Findings (2026-07-19)

### SDK for Embeds (our approach)
- URL: https://matterport.github.io/showcase-sdk/sdk_home.html
- Requires an **SDK Key** (applicationKey) from my.matterport.com → Settings → Developer Tools
- Embed via iframe: `https://my.matterport.com/show?m=[MODEL_SID]&play=1&applicationKey=[SDK_KEY]`
- Connect via JS: `import { connect } from 'sdk.es6.js'; const mpSdk = await connect(iframe);`
- After connect: `mpSdk.<action>(<args>)` for navigation, `mpSdk.on(<event>, callback)` for events

### Key SDK Namespaces (from reference docs)
- `mpSdk.Sweep.moveTo(sweepId)` – Navigate to a sweep position
- `mpSdk.Mattertag.add(tagData)` – Add a mattertag at position
- `mpSdk.Mattertag.navigateToTag(tagId)` – Navigate camera to a tag
- `mpSdk.Camera.moveInDirection(direction)` – Move camera
- `mpSdk.Camera.lookAtScreenCoords(x, y)` – Look at point
- `mpSdk.Floor.moveTo(floorIndex)` – Switch floor
- `mpSdk.Mode.moveTo(mode)` – Switch view mode (dollhouse, floorplan, inside)
- `mpSdk.Pointer.intersection` – Get 3D position from click/tap
- `mpSdk.Model.getData()` – Get model metadata

### For WebView Bridge (React Native)
Since we embed in a WebView, we need to:
1. Load the SDK bootstrap script inside the iframe HTML
2. Connect to the iframe from the parent HTML page
3. Use `window.ReactNativeWebView.postMessage()` to communicate with React Native
4. Inject JavaScript via `webViewRef.current.injectJavaScript()` to send commands

### Architecture for BuildKI
1. **Embed HTML** loads Matterport iframe + SDK bootstrap
2. **SDK connects** to the iframe after load
3. **Bridge layer** translates RN commands → SDK calls and SDK events → RN messages
4. **Pin placement**: Use `mpSdk.Pointer.intersection` to get 3D position on tap, then `mpSdk.Mattertag.add()` or custom overlay
5. **Navigation**: From defect list, send `navigateToTag(tagId)` or `Sweep.moveTo(sweepId)` command
6. **Floor switching**: `mpSdk.Floor.moveTo(index)`
7. **View modes**: Dollhouse, Floorplan, Inside via `mpSdk.Mode.moveTo()`

### SDK Key Requirement
- The SDK Key is separate from the API Token (Token ID + Secret)
- API Token = server-side GraphQL queries (models, rooms, sweeps, mattertags)
- SDK Key = client-side embed interaction (navigation, tag placement, events)
- For our app: SDK Key goes in the embed URL, API Token stays server-side

### Current Implementation Gap
- We already have: API Token auth, model listing, floor/room/sweep/mattertag fetching
- We need to add: SDK Key configuration, SDK bridge in WebView HTML, 3D position capture on tap, programmatic navigation, pin↔defect linking with 3D coordinates
- The current viewer uses a plain embed URL without SDK Key → no programmatic control

### Offline Fallback
- Without internet: show static thumbnail + list of pins
- Matterport requires internet for 3D rendering (no offline 3D)
