import Foundation
import Network

final class LanSync: @unchecked Sendable {
  static let port: NWEndpoint.Port = 17841
  static let serviceType = "_zadachi._tcp"

  private var listener: NWListener?
  private var browser: NWBrowser?
  private let queue = DispatchQueue(label: "zadachi.lan")
  var onRemote: ((Store) -> Store)?
  var onStatus: ((String) -> Void)?
  private var deviceId: String
  private var advertisedName: String
  private var peerEndpoints: [NWEndpoint] = []

  init(deviceId: String) {
    self.deviceId = deviceId
    self.advertisedName = "Task Tracker \(deviceId.suffix(4))"
  }

  func start() {
    startListener()
    startBrowser()
    onStatus?(L10n.t("waitingMac"))
  }

  func refresh(_ store: Store) {
    onStatus?(L10n.t("lookingMac"))
    startBrowser()
    push(store)
  }

  func stop() {
    listener?.cancel()
    browser?.cancel()
    listener = nil
    browser = nil
  }

  func push(_ store: Store) {
    queue.async { [weak self] in
      guard let self else { return }
      if self.peerEndpoints.isEmpty {
        self.onStatus?(L10n.t("waitingMac"))
      }
      for endpoint in self.peerEndpoints {
        self.handle(NWConnection(to: endpoint, using: Self.tcp), outbound: store)
      }
    }
  }

  private static var tcp: NWParameters {
    let params = NWParameters.tcp
    params.includePeerToPeer = true
    params.allowLocalEndpointReuse = true
    return params
  }

  private static func isMacEndpoint(_ endpoint: NWEndpoint) -> Bool {
    guard case .service(let name, _, _, _) = endpoint else { return false }
    let lower = name.lowercased()
    return lower.contains("mac") || name.contains("Задачи")
  }

  private func startListener() {
    do {
      let listener = try NWListener(using: Self.tcp, on: Self.port)
      listener.service = NWListener.Service(name: advertisedName, type: Self.serviceType, domain: nil)
      listener.newConnectionHandler = { [weak self] connection in
        self?.handle(connection, outbound: nil)
      }
      listener.stateUpdateHandler = { [weak self] state in
        if case .failed(let error) = state {
          self?.onStatus?(L10n.t("networkErr", ["error": error.localizedDescription]))
        }
      }
      listener.start(queue: queue)
      self.listener = listener
    } catch {
      onStatus?(L10n.t("portBusy"))
    }
  }

  private func startBrowser() {
    browser?.cancel()
    let browser = NWBrowser(for: .bonjour(type: Self.serviceType, domain: nil), using: Self.tcp)
    browser.browseResultsChangedHandler = { [weak self] results, _ in
      guard let self else { return }
      self.peerEndpoints = results.compactMap { result in
        guard Self.isMacEndpoint(result.endpoint) else { return nil }
        if case .service(let name, _, _, _) = result.endpoint, name == self.advertisedName { return nil }
        return result.endpoint
      }
      if self.peerEndpoints.isEmpty {
        self.onStatus?(L10n.t("waitingMac"))
        return
      }
      self.onStatus?(L10n.t("foundMac"))
      for endpoint in self.peerEndpoints {
        self.handle(NWConnection(to: endpoint, using: Self.tcp), outbound: StoreFile.load())
      }
    }
    browser.stateUpdateHandler = { [weak self] state in
      if case .failed = state { self?.onStatus?(L10n.t("browseFail")) }
    }
    browser.start(queue: queue)
    self.browser = browser
  }

  private func handle(_ connection: NWConnection, outbound: Store?) {
    connection.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        if let outbound {
          self.send(store: outbound, on: connection) { [weak self] in
            self?.receive(on: connection)
          }
        } else {
          self.receive(on: connection)
        }
      case .failed(let error):
        self.onStatus?(L10n.t("noMacLink"))
        print("[lan] failed", error)
        connection.cancel()
      case .waiting(let error):
        print("[lan] waiting", error)
      default:
        break
      }
    }
    connection.start(queue: queue)
  }

  private func receive(on connection: NWConnection) {
    connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] data, _, _, error in
      guard let self, let data, data.count == 4, error == nil else {
        connection.cancel()
        return
      }
      let length = Int(data.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian })
      guard length > 0, length < 8_000_000 else {
        connection.cancel()
        return
      }
      connection.receive(minimumIncompleteLength: length, maximumLength: length) { payload, _, _, error in
        guard let payload, payload.count == length, error == nil else {
          self.onStatus?(L10n.t("syncBroke"))
          connection.cancel()
          return
        }
        self.apply(payload, connection: connection)
      }
    }
  }

  private func apply(_ payload: Data, connection: NWConnection) {
    do {
      let envelope = try JSONDecoder().decode(SyncEnvelope.self, from: payload)
      if envelope.deviceId == deviceId {
        connection.cancel()
        return
      }
      DispatchQueue.main.async {
        let merged = self.onRemote?(envelope.store) ?? envelope.store
        self.onStatus?(L10n.t("withMac"))
        self.queue.async {
          self.send(store: merged, on: connection) {
            connection.cancel()
          }
        }
      }
    } catch {
      onStatus?(L10n.t("syncBad"))
      print("[lan] decode", error)
      connection.cancel()
    }
  }

  private func send(store: Store, on connection: NWConnection, done: @escaping () -> Void) {
    let envelope = SyncEnvelope(deviceId: deviceId, store: store)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let body = try? encoder.encode(envelope) else {
      done()
      return
    }
    var length = UInt32(body.count).bigEndian
    var packet = Data()
    packet.append(Data(bytes: &length, count: 4))
    packet.append(body)
    connection.send(content: packet, completion: .contentProcessed { _ in done() })
  }
}

struct SyncEnvelope: Codable {
  var deviceId: String
  var store: Store
}
