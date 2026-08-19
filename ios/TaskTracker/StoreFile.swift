import Foundation

enum StoreFile {
  static var url: URL {
    let manager = FileManager.default
    let dir = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let folder = dir.appendingPathComponent("Task Tracker", isDirectory: true)
    try? manager.createDirectory(at: folder, withIntermediateDirectories: true)
    let file = folder.appendingPathComponent("tasks.json")
    adoptLegacy(into: file, from: dir)
    return file
  }

  private static func adoptLegacy(into file: URL, from dir: URL) {
    let manager = FileManager.default
    guard !manager.fileExists(atPath: file.path) else { return }
    // Folder used before the app was renamed to Task Tracker.
    let legacy = dir.appendingPathComponent("Задачи", isDirectory: true)
      .appendingPathComponent("tasks.json")
    guard manager.fileExists(atPath: legacy.path) else { return }
    try? manager.copyItem(at: legacy, to: file)
  }

  static func load() -> Store {
    guard let data = try? Data(contentsOf: url) else { return Domain.emptyStore() }
    let decoder = JSONDecoder()
    guard let raw = try? decoder.decode(Store.self, from: data) else { return Domain.emptyStore() }
    return Domain.ensureDeviceId(Domain.migrate(raw))
  }

  static func save(_ store: Store) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    guard let data = try? encoder.encode(store) else { return }
    let tmp = url.appendingPathExtension("tmp")
    try? data.write(to: tmp)
    try? FileManager.default.removeItem(at: url)
    try? FileManager.default.moveItem(at: tmp, to: url)
  }
}
