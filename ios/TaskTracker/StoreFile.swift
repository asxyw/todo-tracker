import Foundation

enum StoreFile {
  static var url: URL {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let folder = dir.appendingPathComponent("Задачи", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder.appendingPathComponent("tasks.json")
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
