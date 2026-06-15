import AppKit
import ApplicationServices
import Foundation

let maxDepth = 9
let maxNodes = 1200

struct ToolError: Error {
    let code: String
    let message: String
}

func writeJSON(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ code: String, _ message: String, status: Int32 = 1) -> Never {
    let payload: [String: Any] = [
        "ok": false,
        "error": [
            "code": code,
            "message": message,
        ],
    ]
    try? writeJSON(payload)
    exit(status)
}

func runningApps() -> [[String: Any]] {
    NSWorkspace.shared.runningApplications
        .filter { isUserFacingApplication($0) }
        .reduce(into: [String: NSRunningApplication]()) { appsByBundleID, app in
            let key = app.bundleIdentifier ?? app.bundleURL?.path ?? "\(app.processIdentifier)"
            if appsByBundleID[key] == nil || app.isActive {
                appsByBundleID[key] = app
            }
        }
        .values
        .sorted {
            if $0.isActive != $1.isActive {
                return $0.isActive
            }
            return ($0.localizedName ?? $0.bundleIdentifier ?? "") <
                    ($1.localizedName ?? $1.bundleIdentifier ?? "")
        }
        .map { app in
            [
                "name": app.localizedName ?? "",
                "bundleIdentifier": app.bundleIdentifier ?? "",
                "path": app.bundleURL?.path ?? "",
                "pid": app.processIdentifier,
                "isActive": app.isActive,
                "isHidden": app.isHidden,
                "status": app.isActive ? "frontmost, running" : "running",
            ]
        }
}

func isUserFacingApplication(_ app: NSRunningApplication) -> Bool {
    guard !app.isTerminated else {
        return false
    }
    guard let bundleURL = app.bundleURL else {
        return false
    }
    guard bundleURL.pathExtension == "app" else {
        return false
    }
    guard app.activationPolicy == .regular else {
        return false
    }

    let path = bundleURL.path
    let name = app.localizedName ?? bundleURL.deletingPathExtension().lastPathComponent
    if name.contains(" Helper") || name.hasSuffix("Helper") {
        return false
    }
    if path.contains("/Contents/Frameworks/") || path.contains("/XPCServices/") {
        return false
    }

    return true
}

func resolveApp(_ query: String) throws -> NSRunningApplication {
    let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }

    if let app = findRunningApp(normalized) {
        return app
    }

    if launchKnownApplication(normalized) {
        let deadline = Date().addingTimeInterval(3.0)
        while Date() < deadline {
            if let app = findRunningApp(normalized) {
                return app
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
        }
    }

    throw ToolError(code: "invalid_app", message: "Invalid app: \(query)")
}

func findRunningApp(_ normalized: String) -> NSRunningApplication? {
    let apps = NSWorkspace.shared.runningApplications.filter { !$0.isTerminated }
    if normalized == "frontmost" || normalized == "frontmost app" {
        if let app = NSWorkspace.shared.frontmostApplication {
            return app
        }
    }

    let lower = normalized.lowercased()
    let exactMatches = apps.filter { app in
        let bundleName = app.bundleURL?.deletingPathExtension().lastPathComponent.lowercased()
        let executableName = app.executableURL?.lastPathComponent.lowercased()
        return app.bundleIdentifier == normalized ||
            app.bundleURL?.path == normalized ||
            app.executableURL?.path == normalized ||
            app.localizedName?.lowercased() == lower ||
            bundleName == lower ||
            executableName == lower
    }
    if let app = exactMatches.first {
        return app
    }

    let prefixMatches = apps.filter { app in
        let bundleName = app.bundleURL?.deletingPathExtension().lastPathComponent.lowercased()
        let executableName = app.executableURL?.lastPathComponent.lowercased()
        return app.localizedName?.lowercased().hasPrefix(lower) == true ||
            app.bundleIdentifier?.lowercased().hasPrefix(lower) == true ||
            bundleName?.hasPrefix(lower) == true ||
            executableName?.hasPrefix(lower) == true
    }
    if prefixMatches.count == 1, let app = prefixMatches.first {
        return app
    }

    return nil
}

func launchKnownApplication(_ query: String) -> Bool {
    let workspace = NSWorkspace.shared
    var candidateURLs: [URL] = []

    if query.contains(".") {
        if let url = workspace.urlForApplication(withBundleIdentifier: query) {
            candidateURLs.append(url)
        }
    }

    if query.hasPrefix("/") {
        candidateURLs.append(URL(fileURLWithPath: query))
    } else {
        candidateURLs.append(URL(fileURLWithPath: "/Applications/\(query).app"))
        candidateURLs.append(URL(fileURLWithPath: "/System/Applications/\(query).app"))
    }

    for url in candidateURLs where FileManager.default.fileExists(atPath: url.path) {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
        let semaphore = DispatchSemaphore(value: 0)
        var success = false
        workspace.openApplication(at: url, configuration: configuration) { app, _ in
            success = app != nil
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 5)
        if success {
            return true
        }
    }

    return false
}

func copyAttribute(_ element: AXUIElement, _ attribute: String) -> AnyObject? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else {
        return nil
    }
    return value
}

func copyAttributeNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyAttributeNames(element, &names) == .success else {
        return []
    }
    return (names as? [String]) ?? []
}

func copyActionNames(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success else {
        return []
    }
    return (names as? [String]) ?? []
}

func convertAXValue(_ value: AXValue) -> Any {
    switch AXValueGetType(value) {
    case .cgPoint:
        var point = CGPoint.zero
        AXValueGetValue(value, .cgPoint, &point)
        return ["x": point.x, "y": point.y]
    case .cgSize:
        var size = CGSize.zero
        AXValueGetValue(value, .cgSize, &size)
        return ["width": size.width, "height": size.height]
    case .cgRect:
        var rect = CGRect.zero
        AXValueGetValue(value, .cgRect, &rect)
        return [
            "x": rect.origin.x,
            "y": rect.origin.y,
            "width": rect.size.width,
            "height": rect.size.height,
        ]
    case .cfRange:
        var range = CFRange()
        AXValueGetValue(value, .cfRange, &range)
        return ["location": range.location, "length": range.length]
    default:
        return String(describing: value)
    }
}

func jsonValue(_ value: AnyObject) -> Any? {
    if CFGetTypeID(value) == AXValueGetTypeID() {
        return convertAXValue(value as! AXValue)
    }
    if let string = value as? String {
        return string
    }
    if let number = value as? NSNumber {
        return number
    }
    if let array = value as? [AnyObject] {
        let converted: [Any] = array.compactMap { item -> Any? in
            if CFGetTypeID(item) == AXUIElementGetTypeID() {
                return nil
            }
            return jsonValue(item)
        }
        return converted
    }
    if let url = value as? URL {
        return url.absoluteString
    }
    return String(describing: value)
}

func scalarAttribute(_ element: AXUIElement, _ attribute: String) -> Any? {
    guard let raw = copyAttribute(element, attribute) else {
        return nil
    }
    if CFGetTypeID(raw) == AXUIElementGetTypeID() {
        return nil
    }
    return jsonValue(raw)
}

func childElements(_ element: AXUIElement) -> [AXUIElement] {
    let childAttributes = [
        kAXChildrenAttribute,
        kAXVisibleChildrenAttribute,
        kAXRowsAttribute,
        kAXColumnsAttribute,
        kAXTabsAttribute,
        kAXSplittersAttribute,
    ]

    var children: [AXUIElement] = []
    var seen = Set<CFHashCode>()
    for attribute in childAttributes {
        guard let raw = copyAttribute(element, attribute) else {
            continue
        }
        let values = (raw as? [AnyObject]) ?? [raw]
        for value in values where CFGetTypeID(value) == AXUIElementGetTypeID() {
            let hash = CFHash(value)
            if !seen.contains(hash) {
                seen.insert(hash)
                children.append(value as! AXUIElement)
            }
        }
    }
    return children
}

func readElement(
    _ element: AXUIElement,
    depth: Int,
    counter: inout Int,
    visited: inout Set<CFHashCode>
) -> [String: Any] {
    let hash = CFHash(element)
    let index = counter
    counter += 1

    var node: [String: Any] = [
        "index": index,
        "depth": depth,
    ]

    if visited.contains(hash) {
        node["cycle"] = true
        return node
    }
    visited.insert(hash)

    let attributeMap = [
        "role": kAXRoleAttribute,
        "subrole": kAXSubroleAttribute,
        "title": kAXTitleAttribute,
        "description": kAXDescriptionAttribute,
        "help": kAXHelpAttribute,
        "identifier": kAXIdentifierAttribute,
        "value": kAXValueAttribute,
        "enabled": kAXEnabledAttribute,
        "focused": kAXFocusedAttribute,
        "selected": kAXSelectedAttribute,
        "position": kAXPositionAttribute,
        "size": kAXSizeAttribute,
    ]

    for (key, attribute) in attributeMap {
        if let value = scalarAttribute(element, attribute) {
            node[key] = value
        }
    }

    let actions = copyActionNames(element)
    if !actions.isEmpty {
        node["actions"] = actions
    }

    let attributeNames = copyAttributeNames(element)
    if !attributeNames.isEmpty {
        node["availableAttributes"] = attributeNames
    }

    if depth < maxDepth && counter < maxNodes {
        let children = childElements(element)
        if !children.isEmpty {
            node["children"] = children.prefix(max(0, maxNodes - counter)).map {
                readElement($0, depth: depth + 1, counter: &counter, visited: &visited)
            }
        }
    } else if depth >= maxDepth {
        node["truncated"] = "max_depth"
    } else {
        node["truncated"] = "max_nodes"
    }

    return node
}

func focusedWindowOrAppElement(pid: pid_t) -> (AXUIElement, String?) {
    let appElement = AXUIElementCreateApplication(pid)
    if let focusedWindow = copyAttribute(appElement, kAXFocusedWindowAttribute),
       CFGetTypeID(focusedWindow) == AXUIElementGetTypeID()
    {
        let title = scalarAttribute(focusedWindow as! AXUIElement, kAXTitleAttribute) as? String
        return (focusedWindow as! AXUIElement, title)
    }

    if let rawWindows = copyAttribute(appElement, kAXWindowsAttribute),
       let windows = rawWindows as? [AnyObject],
       let firstWindow = windows.first(where: { CFGetTypeID($0) == AXUIElementGetTypeID() })
    {
        let title = scalarAttribute(firstWindow as! AXUIElement, kAXTitleAttribute) as? String
        return (firstWindow as! AXUIElement, title)
    }

    return (appElement, nil)
}

func appState(_ query: String) throws -> [String: Any] {
    guard AXIsProcessTrusted() else {
        throw ToolError(
            code: "accessibility_permission_denied",
            message: "Accessibility permission is required to read app state"
        )
    }

    let app = try resolveApp(query)
    let (rootElement, windowTitle) = focusedWindowOrAppElement(pid: app.processIdentifier)
    var counter = 0
    var visited = Set<CFHashCode>()
    let tree = readElement(rootElement, depth: 0, counter: &counter, visited: &visited)

    return [
        "ok": true,
        "source": "local-macos-accessibility",
        "app": [
            "query": query,
            "name": app.localizedName ?? "",
            "bundleIdentifier": app.bundleIdentifier ?? "",
            "path": app.bundleURL?.path ?? "",
            "pid": app.processIdentifier,
            "isActive": app.isActive,
            "isHidden": app.isHidden,
        ],
        "window": [
            "title": windowTitle ?? "",
        ],
        "limits": [
            "maxDepth": maxDepth,
            "maxNodes": maxNodes,
            "returnedNodes": counter,
        ],
        "tree": tree,
    ]
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    fail("usage", "Usage: ax-state.swift <list-apps|state> [app]")
}

do {
    switch command {
    case "list-apps":
        try writeJSON(["ok": true, "apps": runningApps()])
    case "state":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_app", message: "Missing required argument: app")
        }
        try writeJSON(try appState(args.dropFirst().joined(separator: " ")))
    default:
        throw ToolError(code: "usage", message: "Unknown command: \(command)")
    }
} catch let error as ToolError {
    fail(error.code, error.message)
} catch {
    fail("internal_error", error.localizedDescription)
}
