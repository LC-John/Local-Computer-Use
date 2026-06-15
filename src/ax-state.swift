import AppKit
import ApplicationServices
import Foundation
import ImageIO
import UniformTypeIdentifiers

let maxDepth = 9
let maxNodes = 1200

struct ToolError: Error {
    let code: String
    let message: String
}

struct TargetWindow {
    let element: AXUIElement
    let title: String?
    let position: [String: Any]?
    let size: [String: Any]?
}

func writeJSON(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func sanitizeFilenamePart(_ value: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let scalars = value.unicodeScalars.map { scalar -> Character in
        allowed.contains(scalar) ? Character(scalar) : "-"
    }
    let collapsed = String(scalars).replacingOccurrences(
        of: "-+",
        with: "-",
        options: .regularExpression
    )
    return String(collapsed.prefix(80)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
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

func focusedWindowOrAppElement(pid: pid_t) -> TargetWindow {
    let appElement = AXUIElementCreateApplication(pid)
    if let focusedWindow = copyAttribute(appElement, kAXFocusedWindowAttribute),
       CFGetTypeID(focusedWindow) == AXUIElementGetTypeID()
    {
        let element = focusedWindow as! AXUIElement
        let title = scalarAttribute(element, kAXTitleAttribute) as? String
        return TargetWindow(
            element: element,
            title: title,
            position: scalarAttribute(element, kAXPositionAttribute) as? [String: Any],
            size: scalarAttribute(element, kAXSizeAttribute) as? [String: Any]
        )
    }

    if let rawWindows = copyAttribute(appElement, kAXWindowsAttribute),
       let windows = rawWindows as? [AnyObject],
       let firstWindow = windows.first(where: { CFGetTypeID($0) == AXUIElementGetTypeID() })
    {
        let element = firstWindow as! AXUIElement
        let title = scalarAttribute(element, kAXTitleAttribute) as? String
        return TargetWindow(
            element: element,
            title: title,
            position: scalarAttribute(element, kAXPositionAttribute) as? [String: Any],
            size: scalarAttribute(element, kAXSizeAttribute) as? [String: Any]
        )
    }

    return TargetWindow(
        element: appElement,
        title: nil,
        position: scalarAttribute(appElement, kAXPositionAttribute) as? [String: Any],
        size: scalarAttribute(appElement, kAXSizeAttribute) as? [String: Any]
    )
}

func rectDictionary(_ rect: CGRect) -> [String: Any] {
    [
        "x": rect.origin.x,
        "y": rect.origin.y,
        "width": rect.size.width,
        "height": rect.size.height,
    ]
}

func rectFromWindowBounds(_ value: Any?) -> CGRect? {
    guard let dictionary = value as? [String: Any],
          let x = dictionary["X"] as? NSNumber,
          let y = dictionary["Y"] as? NSNumber,
          let width = dictionary["Width"] as? NSNumber,
          let height = dictionary["Height"] as? NSNumber
    else {
        return nil
    }

    return CGRect(
        x: CGFloat(truncating: x),
        y: CGFloat(truncating: y),
        width: CGFloat(truncating: width),
        height: CGFloat(truncating: height)
    )
}

func intersectionArea(_ first: CGRect, _ second: CGRect) -> CGFloat {
    let intersection = first.intersection(second)
    if intersection.isNull || intersection.isEmpty {
        return 0
    }
    return intersection.width * intersection.height
}

func displayScaleForWindow(_ windowBounds: CGRect?) -> [String: Any] {
    guard let windowBounds else {
        return [
            "x": 0,
            "y": 0,
            "source": "unavailable",
        ]
    }

    var count: UInt32 = 0
    guard CGGetOnlineDisplayList(0, nil, &count) == .success, count > 0 else {
        return [
            "x": 0,
            "y": 0,
            "source": "online_display_unavailable",
        ]
    }

    var displays = Array(repeating: CGDirectDisplayID(), count: Int(count))
    guard CGGetOnlineDisplayList(count, &displays, &count) == .success else {
        return [
            "x": 0,
            "y": 0,
            "source": "online_display_unavailable",
        ]
    }

    let bestDisplay = displays
        .map { display -> (display: CGDirectDisplayID, bounds: CGRect, area: CGFloat) in
            let bounds = CGDisplayBounds(display)
            return (display, bounds, intersectionArea(windowBounds, bounds))
        }
        .max { lhs, rhs in lhs.area < rhs.area }

    guard let selected = bestDisplay, selected.bounds.width > 0, selected.bounds.height > 0 else {
        return [
            "x": 0,
            "y": 0,
            "source": "display_match_unavailable",
        ]
    }

    let matchedScreen = NSScreen.screens.first { screen in
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
            return false
        }
        return number.uint32Value == selected.display
    }
    if let matchedScreen {
        let scale = matchedScreen.backingScaleFactor
        return [
            "x": scale,
            "y": scale,
            "source": "ns_screen_backing_scale_factor",
            "displayID": selected.display,
            "displayBounds": rectDictionary(selected.bounds),
        ]
    }

    return [
        "x": CGFloat(CGDisplayPixelsWide(selected.display)) / selected.bounds.width,
        "y": CGFloat(CGDisplayPixelsHigh(selected.display)) / selected.bounds.height,
        "source": "core_graphics_display_fallback",
        "displayID": selected.display,
        "displayBounds": rectDictionary(selected.bounds),
    ]
}

func windowInfoDictionaries(pid: pid_t) -> [[String: Any]] {
    guard let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID),
          let windows = raw as? [[String: Any]]
    else {
        return []
    }

    return windows.filter { info in
        guard let ownerPID = info[kCGWindowOwnerPID as String] as? NSNumber,
              ownerPID.int32Value == pid,
              let layer = info[kCGWindowLayer as String] as? NSNumber,
              layer.intValue == 0,
              let bounds = rectFromWindowBounds(info[kCGWindowBounds as String]),
              bounds.width > 0,
              bounds.height > 0
        else {
            return false
        }
        return true
    }
}

func bestWindowInfo(pid: pid_t, title: String?) -> [String: Any]? {
    let windows = windowInfoDictionaries(pid: pid)
    guard !windows.isEmpty else {
        return nil
    }

    if let title, !title.isEmpty {
        if let exact = windows.first(where: {
            ($0[kCGWindowName as String] as? String) == title
        }) {
            return exact
        }
        if let fuzzy = windows.first(where: {
            guard let name = $0[kCGWindowName as String] as? String else {
                return false
            }
            return name.contains(title) || title.contains(name)
        }) {
            return fuzzy
        }
    }

    return windows.first
}

func runScreenshotCommand(windowID: CGWindowID, outputURL: URL) -> Bool {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = [
        "-x",
        "-l",
        String(windowID),
        outputURL.path,
    ]

    do {
        try process.run()
        process.waitUntilExit()
        return process.terminationStatus == 0 &&
            FileManager.default.fileExists(atPath: outputURL.path)
    } catch {
        return false
    }
}

func imageDimensions(_ url: URL) -> (width: Int, height: Int)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let width = properties[kCGImagePropertyPixelWidth as String] as? NSNumber,
          let height = properties[kCGImagePropertyPixelHeight as String] as? NSNumber
    else {
        return nil
    }

    return (width.intValue, height.intValue)
}

func captureWindowScreenshot(app: NSRunningApplication, window: TargetWindow) -> [String: Any] {
    guard let info = bestWindowInfo(pid: app.processIdentifier, title: window.title),
          let windowNumber = info[kCGWindowNumber as String] as? NSNumber
    else {
        return [
            "status": "unavailable",
            "error": [
                "code": "window_not_found",
                "message": "No on-screen window was found for screenshot capture",
            ],
        ]
    }

    let windowID = CGWindowID(truncating: windowNumber)
    let screenshotDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        .appendingPathComponent(".build", isDirectory: true)
        .appendingPathComponent("screenshots", isDirectory: true)
    do {
        try FileManager.default.createDirectory(at: screenshotDir, withIntermediateDirectories: true)
    } catch {
        return [
            "status": "unavailable",
            "windowID": windowID,
            "error": [
                "code": "screenshot_directory_failed",
                "message": error.localizedDescription,
            ],
        ]
    }

    let appName = sanitizeFilenamePart(app.localizedName ?? app.bundleIdentifier ?? "app")
    let timestamp = Int(Date().timeIntervalSince1970 * 1000)
    let filename = "\(appName)-\(windowID)-\(timestamp).png"
    let url = screenshotDir.appendingPathComponent(filename)

    guard runScreenshotCommand(windowID: windowID, outputURL: url) else {
        return [
            "status": "unavailable",
            "windowID": windowID,
            "error": [
                "code": "screenshot_capture_failed",
                "message": "Unable to capture window PNG; Screen Recording permission may be required",
            ],
        ]
    }

    let bounds = rectFromWindowBounds(info[kCGWindowBounds as String])
    let dimensions = imageDimensions(url) ?? (0, 0)
    let pixelWidth = dimensions.width
    let pixelHeight = dimensions.height
    let captureScaleX = bounds?.width ?? 0 > 0 ? CGFloat(pixelWidth) / (bounds?.width ?? 1) : 0
    let captureScaleY = bounds?.height ?? 0 > 0 ? CGFloat(pixelHeight) / (bounds?.height ?? 1) : 0
    let displayScale = displayScaleForWindow(bounds)
    let displayScaleX = displayScale["x"] as? CGFloat ?? 0
    let displayScaleY = displayScale["y"] as? CGFloat ?? 0
    let contentPixelWidth = (bounds?.width ?? 0) * displayScaleX
    let contentPixelHeight = (bounds?.height ?? 0) * displayScaleY
    let contentOriginX = max(0, (CGFloat(pixelWidth) - contentPixelWidth) / 2)
    let contentOriginY = max(0, (CGFloat(pixelHeight) - contentPixelHeight) / 2)

    return [
        "status": "captured",
        "path": url.path,
        "encoding": "png_file",
        "windowID": windowID,
        "width": pixelWidth,
        "height": pixelHeight,
        "windowFrame": bounds.map(rectDictionary) ?? [:],
        "displayScale": displayScale,
        "imageContentOrigin": [
            "x": contentOriginX,
            "y": contentOriginY,
            "source": "centered_window_frame_within_screencapture_image",
        ],
        "captureScaleEstimate": [
            "x": captureScaleX,
            "y": captureScaleY,
            "source": "screenshot_pixels_divided_by_window_frame",
            "note": "May include window shadow or capture padding from screencapture -l",
        ],
        "coordinateSystem": [
            "windowFrame": "global_screen_points",
            "screenshot": "image_pixels",
            "origin": "top_left",
        ],
    ]
}

func appState(_ query: String) throws -> [String: Any] {
    guard AXIsProcessTrusted() else {
        throw ToolError(
            code: "accessibility_permission_denied",
            message: "Accessibility permission is required to read app state"
        )
    }

    let app = try resolveApp(query)
    let targetWindow = focusedWindowOrAppElement(pid: app.processIdentifier)
    var counter = 0
    var visited = Set<CFHashCode>()
    let tree = readElement(targetWindow.element, depth: 0, counter: &counter, visited: &visited)
    let screenshot = captureWindowScreenshot(app: app, window: targetWindow)

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
            "title": targetWindow.title ?? "",
            "position": targetWindow.position ?? [:],
            "size": targetWindow.size ?? [:],
        ],
        "screenshot": screenshot,
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
