# Task Tracker

A personal task list for Mac and iPhone. English by default, with a **RU | EN** switch. Today, inbox, dated tasks, and one-step projects. Data is a JSON file on the device. Optional sync over local Wi‑Fi. No account, no cloud.

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

Download `TaskTracker-ios.zip` from [Releases](https://github.com/asxyw/todo-tracker/releases) if you just want the Xcode project, or clone this repo. Open `ios/TaskTracker.xcodeproj`, choose your Team under Signing, and run on an iPhone.

Allow Local Network on the phone. Keep the Mac app open on the same Wi‑Fi to sync.

There is no App Store build. Apple will not install an unsigned `.ipa` from GitHub.

## Source

This repository is the source: Electron app in `src/`, iPhone app in `ios/`.

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
