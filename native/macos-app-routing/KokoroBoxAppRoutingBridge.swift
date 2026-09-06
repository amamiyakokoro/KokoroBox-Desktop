import AppKit
import Darwin
import Foundation
import NetworkExtension
import Security
import SystemExtensions

private let protocolVersion = 1
private let extensionIdentifier = "com.amamiyakokoro.app.proxy-extension"
private let managerDescription = "KokoroBox Application Routing"
private let parentCodeRequirement = "anchor apple generic and identifier \"com.amamiyakokoro.app\" and certificate leaf[subject.OU] = \"755TNLRN92\""

private struct RoutingRule: Codable {
    let signingIdentifier: String
    let ruleProtocol: String
    let action: String
    let enabled: Bool
    let priority: Int
}

private struct RoutingConfiguration: Codable {
    let version: Int
    let failClosed: Bool
    let proxyAvailable: Bool
    let proxyHost: String
    let proxyPort: Int
    let diagnosticLogging: Bool
    let rules: [RoutingRule]
}

private struct Request: Codable {
    let version: Int
    let command: String
    let configuration: RoutingConfiguration?
}

private struct Response: Codable {
    let version: Int
    let ok: Bool
    let state: String
    let needsUserApproval: Bool
    let message: String?
}

private enum BridgeError: LocalizedError {
    case invalidRequest
    case timeout
    case providerUnavailable
    case invalidProviderResponse
    case untrustedParent

    var errorDescription: String? {
        switch self {
        case .invalidRequest: return "Invalid bridge request"
        case .timeout: return "The macOS networking operation timed out"
        case .providerUnavailable: return "The transparent proxy provider is unavailable"
        case .invalidProviderResponse: return "The transparent proxy provider returned an invalid response"
        case .untrustedParent: return "The application-routing bridge rejected its parent process"
        }
    }
}

private func validateParentProcess() throws {
    let attributes = [kSecGuestAttributePid as String: NSNumber(value: getppid())] as CFDictionary
    var parentCode: SecCode?
    guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &parentCode) == errSecSuccess,
          let parentCode else {
        throw BridgeError.untrustedParent
    }
    var requirement: SecRequirement?
    guard SecRequirementCreateWithString(
        parentCodeRequirement as CFString,
        [],
        &requirement
    ) == errSecSuccess,
    let requirement,
    SecCodeCheckValidity(parentCode, [], requirement) == errSecSuccess else {
        throw BridgeError.untrustedParent
    }
}

private func awaitResult<T>(
    timeout: TimeInterval = 30,
    _ operation: (@escaping (Result<T, Error>) -> Void) -> Void
) throws -> T {
    var result: Result<T, Error>?
    operation { result = $0 }
    let deadline = Date().addingTimeInterval(timeout)
    while result == nil && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
    guard let result else { throw BridgeError.timeout }
    return try result.get()
}

private final class ExtensionActivationDelegate: NSObject, OSSystemExtensionRequestDelegate {
    var result: Result<Void, Error>?
    var needsUserApproval = false

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        needsUserApproval = true
    }

    func request(
        _ request: OSSystemExtensionRequest,
        actionForReplacingExtension existing: OSSystemExtensionProperties,
        withExtension ext: OSSystemExtensionProperties
    ) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }

    func request(
        _ request: OSSystemExtensionRequest,
        didFinishWithResult result: OSSystemExtensionRequest.Result
    ) {
        self.result = .success(())
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        result = .failure(error)
    }
}

private func activateExtension() throws -> Bool {
    let delegate = ExtensionActivationDelegate()
    let request = OSSystemExtensionRequest.activationRequest(
        forExtensionWithIdentifier: extensionIdentifier,
        queue: .main
    )
    request.delegate = delegate
    OSSystemExtensionManager.shared.submitRequest(request)
    let deadline = Date().addingTimeInterval(300)
    while delegate.result == nil && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
    }
    guard let result = delegate.result else { throw BridgeError.timeout }
    try result.get()
    return delegate.needsUserApproval
}

private func loadManagers() throws -> [NETransparentProxyManager] {
    try awaitResult { completion in
        NETransparentProxyManager.loadAllFromPreferences { managers, error in
            if let error { completion(.failure(error)) }
            else { completion(.success(managers ?? [])) }
        }
    }
}

private func loadManager() throws -> NETransparentProxyManager? {
    try loadManagers().first { manager in
        guard let tunnel = manager.protocolConfiguration as? NETunnelProviderProtocol else {
            return false
        }
        return tunnel.providerBundleIdentifier == extensionIdentifier
    }
}

private func save(_ manager: NETransparentProxyManager) throws {
    let _: Void = try awaitResult { completion in
        manager.saveToPreferences { error in
            if let error { completion(.failure(error)) }
            else { completion(.success(())) }
        }
    }
    let _: Void = try awaitResult { completion in
        manager.loadFromPreferences { error in
            if let error { completion(.failure(error)) }
            else { completion(.success(())) }
        }
    }
}

private func statusName(_ status: NEVPNStatus) -> String {
    switch status {
    case .invalid: return "disabled"
    case .disconnected: return "disabled"
    case .connecting, .reasserting: return "starting"
    case .connected: return "running"
    case .disconnecting: return "stopping"
    @unknown default: return "error"
    }
}

private func providerMessage(for configuration: RoutingConfiguration) throws -> Data {
    let configurationData = try JSONEncoder().encode(configuration)
    let configurationObject = try JSONSerialization.jsonObject(with: configurationData)
    return try JSONSerialization.data(withJSONObject: [
        "action": "replaceKokoroBoxConfiguration",
        "configuration": configurationObject
    ])
}

private func sendConfiguration(
    _ configuration: RoutingConfiguration,
    to manager: NETransparentProxyManager
) throws {
    guard let session = manager.connection as? NETunnelProviderSession else {
        throw BridgeError.providerUnavailable
    }
    let response: Data? = try awaitResult { completion in
        do {
            try session.sendProviderMessage(providerMessage(for: configuration)) { data in
                completion(.success(data))
            }
        } catch {
            completion(.failure(error))
        }
    }
    guard let response,
          let object = try JSONSerialization.jsonObject(with: response) as? [String: Any],
          object["status"] as? String == "ok",
          object["version"] as? Int == protocolVersion else {
        throw BridgeError.invalidProviderResponse
    }
}

private func apply(_ configuration: RoutingConfiguration) throws -> String {
    guard configuration.version == protocolVersion,
          configuration.failClosed,
          configuration.proxyHost == "127.0.0.1",
          configuration.proxyPort == 7891 else {
        throw BridgeError.invalidRequest
    }
    let manager = try loadManager() ?? NETransparentProxyManager()

    if manager.connection.status == .connected {
        try sendConfiguration(configuration, to: manager)
    }

    let configurationData = try JSONEncoder().encode(configuration)
    let tunnel = NETunnelProviderProtocol()
    tunnel.providerBundleIdentifier = extensionIdentifier
    tunnel.serverAddress = "127.0.0.1:7891"
    tunnel.providerConfiguration = ["kokoroBoxConfiguration": configurationData]
    manager.protocolConfiguration = tunnel
    manager.localizedDescription = managerDescription
    manager.isEnabled = true
    try save(manager)

    if manager.connection.status == .disconnected || manager.connection.status == .invalid {
        try manager.connection.startVPNTunnel()
    }
    return statusName(manager.connection.status)
}

private func stop() throws -> String {
    guard let manager = try loadManager() else { return "disabled" }
    manager.connection.stopVPNTunnel()
    manager.isEnabled = false
    try save(manager)
    return "disabled"
}

private func currentStatus() throws -> String {
    guard let manager = try loadManager(), manager.isEnabled else { return "disabled" }
    return statusName(manager.connection.status)
}

private func openNetworkSettings() {
    if let url = URL(string: "x-apple.systempreferences:com.apple.NetworkExtensionSettings") {
        NSWorkspace.shared.open(url)
    }
}

private func writeResponse(_ response: Response) {
    guard let data = try? JSONEncoder().encode(response) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

do {
    try validateParentProcess()
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let request = try JSONDecoder().decode(Request.self, from: input)
    guard request.version == protocolVersion else { throw BridgeError.invalidRequest }
    var needsUserApproval = false
    let state: String
    switch request.command {
    case "apply":
        guard let configuration = request.configuration else { throw BridgeError.invalidRequest }
        needsUserApproval = try activateExtension()
        state = try apply(configuration)
    case "stop":
        state = try stop()
    case "status":
        state = try currentStatus()
    case "open-settings":
        openNetworkSettings()
        state = try currentStatus()
    default:
        throw BridgeError.invalidRequest
    }
    writeResponse(Response(
        version: protocolVersion,
        ok: true,
        state: state,
        needsUserApproval: needsUserApproval,
        message: nil
    ))
} catch {
    writeResponse(Response(
        version: protocolVersion,
        ok: false,
        state: "error",
        needsUserApproval: false,
        message: error.localizedDescription
    ))
    exit(1)
}
