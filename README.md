# Task Tracker

Local task list for macOS and iOS. Russian UI. Data stays on the device as JSON. Optional sync over local Wi‑Fi between the Mac app and the iPhone app. No cloud account.

## Mac

Requires Node.js 22+ and macOS.

```bash
npm install
npm start
```

Build a `.app`:

```bash
npm run pack
```

This writes `Task Tracker.app` next to the project. Tasks are stored at:

`~/Library/Application Support/Задачи/tasks.json`

## iOS

Open `ios/TaskTracker.xcodeproj` in Xcode, pick your Team under Signing, then run on a device. The Mac app must be open on the same Wi‑Fi for sync. Allow local network access on both sides.

## License

MIT. Author: [asxyw](https://github.com/asxyw)
