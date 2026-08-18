# Task Tracker

Local task list for macOS and iOS. Russian UI. Data stays on the device as JSON. Optional sync over local Wi‑Fi between the Mac app and the iPhone app. No cloud account.

## Install the Mac app

Builds in [Releases](https://github.com/asxyw/todo-tracker/releases) are **not signed and not notarized**. macOS will warn that the developer cannot be verified. That is expected.

Apple Silicon only (`arm64`).

1. Download `TaskTracker-macos-arm64.zip` from the latest release and unzip it.
2. Right-click `Task Tracker.app` → **Open** → **Open**. Do not double-click the first time.
3. If macOS still blocks it: **System Settings → Privacy & Security** → **Open Anyway**.
4. If it still will not launch, in Terminal:

```bash
xattr -cr "/path/to/Task Tracker.app"
open "/path/to/Task Tracker.app"
```

Tasks are stored at `~/Library/Application Support/Задачи/tasks.json`. Nothing is uploaded.

## iOS

There is no sideload build in Releases. Open `ios/TaskTracker.xcodeproj` in Xcode, choose your Team under Signing, and run on an iPhone. Allow Local Network on the phone. Keep the Mac app open on the same Wi‑Fi to sync.

## Build from source

Requires Node.js 22+ and macOS.

```bash
npm install
npm start
```

Pack a `.app`:

```bash
npm run pack
```

## License

MIT. Author: [asxyw](https://github.com/asxyw)
