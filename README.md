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

[Releases](https://github.com/asxyw/todo-tracker/releases) include `TaskTracker-ios.ipa`. That file is a **development** build: it only installs on iPhones already on the signing team (Xcode / Apple Configurator). It is not an App Store or TestFlight build. A random iPhone cannot sideload it from GitHub.

Everyone else: clone this repo, open `ios/TaskTracker.xcodeproj` in Xcode, choose your Team under Signing, and run on the phone.

Allow Local Network on the phone. Keep the Mac app open on the same Wi‑Fi to sync.

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
