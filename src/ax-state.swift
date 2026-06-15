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

struct ActionOutcome {
    let method: String
    let point: CGPoint?
    let elementIndex: Int?
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

func permissionState() -> [String: Any] {
    [
        "ok": true,
        "source": "local-macos-permission-check",
        "permissions": [
            "accessibility": [
                "granted": AXIsProcessTrusted(),
                "method": "AXIsProcessTrusted",
            ],
            "screenRecording": [
                "granted": CGPreflightScreenCaptureAccess(),
                "method": "CGPreflightScreenCaptureAccess",
            ],
        ],
    ]
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

func knownApplicationURL(_ query: String) -> URL? {
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

    return candidateURLs.first { FileManager.default.fileExists(atPath: $0.path) }
}

func appIdentity(_ query: String) throws -> [String: Any] {
    let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }

    if let app = findRunningApp(normalized) {
        return [
            "ok": true,
            "source": "local-macos-app-identity",
            "app": [
                "query": query,
                "name": app.localizedName ?? "",
                "bundleIdentifier": app.bundleIdentifier ?? "",
                "path": app.bundleURL?.path ?? "",
                "executablePath": app.executableURL?.path ?? "",
                "pid": app.processIdentifier,
                "isRunning": true,
                "isActive": app.isActive,
            ],
        ]
    }

    if let url = knownApplicationURL(normalized) {
        let bundle = Bundle(url: url)
        return [
            "ok": true,
            "source": "local-macos-app-identity",
            "app": [
                "query": query,
                "name": bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
                    ?? bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String
                    ?? url.deletingPathExtension().lastPathComponent,
                "bundleIdentifier": bundle?.bundleIdentifier ?? "",
                "path": url.path,
                "executablePath": "",
                "pid": 0,
                "isRunning": false,
                "isActive": false,
            ],
        ]
    }

    throw ToolError(code: "invalid_app", message: "Invalid app: \(query)")
}

func launchKnownApplication(_ query: String) -> Bool {
    let workspace = NSWorkspace.shared

    if let url = knownApplicationURL(query) {
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

func findElementByIndex(
    _ element: AXUIElement,
    targetIndex: Int,
    depth: Int,
    counter: inout Int,
    visited: inout Set<CFHashCode>
) -> AXUIElement? {
    let hash = CFHash(element)
    let index = counter
    counter += 1

    if index == targetIndex {
        return element
    }
    if visited.contains(hash) {
        return nil
    }
    visited.insert(hash)

    if depth >= maxDepth || counter >= maxNodes {
        return nil
    }

    for child in childElements(element) {
        if let found = findElementByIndex(
            child,
            targetIndex: targetIndex,
            depth: depth + 1,
            counter: &counter,
            visited: &visited
        ) {
            return found
        }
    }

    return nil
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

func pointDictionary(_ point: CGPoint) -> [String: Any] {
    [
        "x": point.x,
        "y": point.y,
    ]
}

func numberFromJSON(_ value: Any?) -> Double? {
    if let number = value as? NSNumber {
        return number.doubleValue
    }
    if let string = value as? String {
        return Double(string)
    }
    return nil
}

func intFromJSON(_ value: Any?) -> Int? {
    if let number = value as? NSNumber {
        return number.intValue
    }
    if let string = value as? String {
        return Int(string)
    }
    return nil
}

func clickButton(_ value: Any?) -> CGMouseButton {
    let raw = (value as? String) ?? "left"
    switch raw {
    case "right":
        return .right
    case "middle":
        return .center
    default:
        return .left
    }
}

func mouseTypes(for button: CGMouseButton) -> (down: CGEventType, up: CGEventType) {
    switch button {
    case .right:
        return (.rightMouseDown, .rightMouseUp)
    case .center:
        return (.otherMouseDown, .otherMouseUp)
    default:
        return (.leftMouseDown, .leftMouseUp)
    }
}

func postClick(at point: CGPoint, button: CGMouseButton, clickCount: Int) {
    let source = CGEventSource(stateID: .hidSystemState)
    let types = mouseTypes(for: button)
    let count = max(1, clickCount)

    for clickIndex in 1...count {
        guard let down = CGEvent(
            mouseEventSource: source,
            mouseType: types.down,
            mouseCursorPosition: point,
            mouseButton: button
        ),
            let up = CGEvent(
                mouseEventSource: source,
                mouseType: types.up,
                mouseCursorPosition: point,
                mouseButton: button
            )
        else {
            continue
        }
        down.setIntegerValueField(.mouseEventClickState, value: Int64(clickIndex))
        up.setIntegerValueField(.mouseEventClickState, value: Int64(clickIndex))
        down.post(tap: .cghidEventTap)
        usleep(35_000)
        up.post(tap: .cghidEventTap)
        usleep(75_000)
    }
}

func postDrag(from: CGPoint, to: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)
    guard let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: from, mouseButton: .left),
          let drag = CGEvent(mouseEventSource: source, mouseType: .leftMouseDragged, mouseCursorPosition: to, mouseButton: .left),
          let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: to, mouseButton: .left)
    else {
        return
    }
    down.post(tap: .cghidEventTap)
    usleep(80_000)
    drag.post(tap: .cghidEventTap)
    usleep(120_000)
    up.post(tap: .cghidEventTap)
    usleep(100_000)
}

func postScroll(at point: CGPoint?, direction: String, pages: Int) {
    let source = CGEventSource(stateID: .hidSystemState)
    let amount = Int32(max(1, pages) * 8)
    let wheel1: Int32
    let wheel2: Int32
    switch direction.lowercased() {
    case "up":
        wheel1 = amount
        wheel2 = 0
    case "down":
        wheel1 = -amount
        wheel2 = 0
    case "left":
        wheel1 = 0
        wheel2 = amount
    case "right":
        wheel1 = 0
        wheel2 = -amount
    default:
        wheel1 = 0
        wheel2 = 0
    }
    guard let event = CGEvent(
        scrollWheelEvent2Source: source,
        units: .line,
        wheelCount: 2,
        wheel1: wheel1,
        wheel2: wheel2,
        wheel3: 0
    ) else {
        return
    }
    if let point {
        event.location = point
    }
    event.post(tap: .cghidEventTap)
    usleep(120_000)
}

func activateApp(_ app: NSRunningApplication) {
    app.activate(options: [.activateIgnoringOtherApps])
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))
}

func cgFlags(from modifiers: Set<String>) -> CGEventFlags {
    var flags = CGEventFlags()
    if modifiers.contains("shift") {
        flags.insert(.maskShift)
    }
    if modifiers.contains("ctrl") || modifiers.contains("control") {
        flags.insert(.maskControl)
    }
    if modifiers.contains("alt") || modifiers.contains("option") {
        flags.insert(.maskAlternate)
    }
    if modifiers.contains("cmd") || modifiers.contains("command") || modifiers.contains("super") || modifiers.contains("meta") {
        flags.insert(.maskCommand)
    }
    return flags
}

func keyCode(for rawKey: String) -> CGKeyCode? {
    let key = rawKey.lowercased()
    let table: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7,
        "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
        "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
        "5": 23, "=": 24, "+": 24, "9": 25, "7": 26, "-": 27, "8": 28,
        "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
        "return": 36, "enter": 36, "tab": 48, "space": 49, " ": 49,
        "delete": 51, "backspace": 51, "escape": 53, "esc": 53,
        "command": 55, "shift": 56, "capslock": 57, "option": 58, "alt": 58,
        "control": 59, "ctrl": 59, "rightshift": 60, "rightoption": 61,
        "rightcontrol": 62, "function": 63, "f17": 64, ".": 65, "*": 67,
        "kp_multiply": 67, "kp+": 69, "kp_plus": 69, "clear": 71,
        "volumeup": 72, "volumedown": 73, "mute": 74, "kp/": 75,
        "kp_divide": 75, "kp_enter": 76, "kp-": 78, "kp_minus": 78,
        "f18": 79, "f19": 80, "kp=": 81, "kp0": 82, "kp1": 83, "kp2": 84,
        "kp3": 85, "kp4": 86, "kp5": 87, "kp6": 88, "kp7": 89, "f20": 90,
        "kp8": 91, "kp9": 92, "f5": 96, "f6": 97, "f7": 98, "f3": 99,
        "f8": 100, "f9": 101, "f11": 103, "f13": 105, "f16": 106,
        "f14": 107, "f10": 109, "f12": 111, "f15": 113, "help": 114,
        "home": 115, "pageup": 116, "forwarddelete": 117, "end": 119,
        "pagedown": 121, "left": 123, "leftarrow": 123, "right": 124,
        "rightarrow": 124, "down": 125, "downarrow": 125, "up": 126,
        "uparrow": 126,
    ]
    return table[key]
}

func postKey(code: CGKeyCode, flags: CGEventFlags = []) {
    let source = CGEventSource(stateID: .hidSystemState)
    guard let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
    else {
        return
    }
    down.flags = flags
    up.flags = flags
    down.post(tap: .cghidEventTap)
    usleep(35_000)
    up.post(tap: .cghidEventTap)
    usleep(60_000)
}

func postUnicodeText(_ text: String) {
    let source = CGEventSource(stateID: .hidSystemState)
    for scalar in text.unicodeScalars {
        var value = UniChar(scalar.value)
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
        else {
            continue
        }
        down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &value)
        down.post(tap: .cghidEventTap)
        usleep(15_000)
        up.post(tap: .cghidEventTap)
        usleep(15_000)
    }
}

func parseKeyCombination(_ raw: String) throws -> (key: String, modifiers: Set<String>) {
    let parts = raw
        .split(separator: "+")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    guard let key = parts.last else {
        throw ToolError(code: "invalid_key", message: "Key must not be empty")
    }
    return (key: key, modifiers: Set(parts.dropLast().map { $0.lowercased() }))
}

func elementCenter(_ element: AXUIElement) -> CGPoint? {
    guard let position = scalarAttribute(element, kAXPositionAttribute) as? [String: Any],
          let size = scalarAttribute(element, kAXSizeAttribute) as? [String: Any],
          let x = numberFromJSON(position["x"]),
          let y = numberFromJSON(position["y"]),
          let width = numberFromJSON(size["width"]),
          let height = numberFromJSON(size["height"]),
          width > 0,
          height > 0
    else {
        return nil
    }

    return CGPoint(x: x + width / 2, y: y + height / 2)
}

func screenshotPointToGlobal(_ x: Double, _ y: Double, screenshot: [String: Any]) -> CGPoint? {
    guard let frame = screenshot["windowFrame"] as? [String: Any],
          let scale = screenshot["displayScale"] as? [String: Any],
          let frameX = numberFromJSON(frame["x"]),
          let frameY = numberFromJSON(frame["y"]),
          let scaleX = numberFromJSON(scale["x"]),
          let scaleY = numberFromJSON(scale["y"]),
          scaleX > 0,
          scaleY > 0
    else {
        return nil
    }

    let origin = screenshot["imageContentOrigin"] as? [String: Any]
    let originX = numberFromJSON(origin?["x"]) ?? 0
    let originY = numberFromJSON(origin?["y"]) ?? 0

    return CGPoint(
        x: frameX + ((x - originX) / scaleX),
        y: frameY + ((y - originY) / scaleY)
    )
}

func parseActionArguments(_ raw: String) throws -> [String: Any] {
    guard let data = raw.data(using: .utf8),
          let parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        throw ToolError(code: "invalid_arguments", message: "Action arguments must be a JSON object")
    }
    return parsed
}

func actionApp(_ args: [String: Any], permissionMessage: String) throws -> NSRunningApplication {
    guard let appQuery = args["app"] as? String else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }
    guard AXIsProcessTrusted() else {
        throw ToolError(code: "accessibility_permission_denied", message: permissionMessage)
    }
    let app = try resolveApp(appQuery)
    activateApp(app)
    return app
}

func currentElement(app: NSRunningApplication, rawIndex: Any?) throws -> AXUIElement {
    guard let elementIndex = intFromJSON(rawIndex) else {
        throw ToolError(code: "missing_element_index", message: "Missing required argument: element_index")
    }
    let targetWindow = focusedWindowOrAppElement(pid: app.processIdentifier)
    var counter = 0
    var visited = Set<CFHashCode>()
    guard let element = findElementByIndex(
        targetWindow.element,
        targetIndex: elementIndex,
        depth: 0,
        counter: &counter,
        visited: &visited
    ) else {
        throw ToolError(code: "element_not_found", message: "Element index not found: \(elementIndex)")
    }
    return element
}

func actionResult(_ action: String, appQuery: String, app: NSRunningApplication, result: [String: Any]) -> [String: Any] {
    [
        "ok": true,
        "source": "local-macos-accessibility-action",
        "action": action,
        "app": [
            "query": appQuery,
            "name": app.localizedName ?? "",
            "bundleIdentifier": app.bundleIdentifier ?? "",
            "pid": app.processIdentifier,
        ],
        "result": result,
    ]
}

func appQuery(_ args: [String: Any]) throws -> String {
    guard let appQuery = args["app"] as? String else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }
    return appQuery
}

func performClick(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    guard let appQuery = args["app"] as? String else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }
    guard AXIsProcessTrusted() else {
        throw ToolError(
            code: "accessibility_permission_denied",
            message: "Accessibility permission is required to click"
        )
    }

    let app = try resolveApp(appQuery)
    activateApp(app)

    let targetWindow = focusedWindowOrAppElement(pid: app.processIdentifier)
    let clickCount = intFromJSON(args["click_count"]) ?? 1
    let button = clickButton(args["mouse_button"])
    let root = targetWindow.element

    let outcome: ActionOutcome
    if let rawIndex = args["element_index"], let elementIndex = intFromJSON(rawIndex) {
        var counter = 0
        var visited = Set<CFHashCode>()
        guard let element = findElementByIndex(
            root,
            targetIndex: elementIndex,
            depth: 0,
            counter: &counter,
            visited: &visited
        ) else {
            throw ToolError(code: "element_not_found", message: "Element index not found: \(elementIndex)")
        }

        if button == .left && clickCount == 1 && copyActionNames(element).contains(kAXPressAction) {
            let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
            if result == .success {
                outcome = ActionOutcome(method: "ax_press", point: nil, elementIndex: elementIndex)
            } else if let point = elementCenter(element) {
                postClick(at: point, button: button, clickCount: clickCount)
                outcome = ActionOutcome(method: "cg_event_element_center", point: point, elementIndex: elementIndex)
            } else {
                throw ToolError(code: "click_failed", message: "AXPress failed and element center is unavailable")
            }
        } else if let point = elementCenter(element) {
            postClick(at: point, button: button, clickCount: clickCount)
            outcome = ActionOutcome(method: "cg_event_element_center", point: point, elementIndex: elementIndex)
        } else {
            throw ToolError(code: "unsupported_element", message: "Element has no AXPress action or usable bounds")
        }
    } else if let x = numberFromJSON(args["x"]), let y = numberFromJSON(args["y"]) {
        let screenshot = captureWindowScreenshot(app: app, window: targetWindow)
        guard screenshot["status"] as? String == "captured",
              let point = screenshotPointToGlobal(x, y, screenshot: screenshot)
        else {
            throw ToolError(code: "coordinate_mapping_failed", message: "Unable to map screenshot coordinates")
        }
        postClick(at: point, button: button, clickCount: clickCount)
        outcome = ActionOutcome(method: "cg_event_screenshot_coordinate", point: point, elementIndex: nil)
    } else {
        throw ToolError(
            code: "missing_click_target",
            message: "click requires element_index or both x and y screenshot coordinates"
        )
    }

    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.2))
    return [
        "ok": true,
        "source": "local-macos-accessibility-action",
        "action": "click",
        "app": [
            "query": appQuery,
            "name": app.localizedName ?? "",
            "bundleIdentifier": app.bundleIdentifier ?? "",
            "pid": app.processIdentifier,
        ],
        "result": [
            "method": outcome.method,
            "elementIndex": outcome.elementIndex as Any,
            "point": outcome.point.map(pointDictionary) as Any,
            "clickCount": max(1, clickCount),
            "button": (args["mouse_button"] as? String) ?? "left",
        ],
    ]
}

func performSetValue(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    let query = try appQuery(args)
    let app = try actionApp(args, permissionMessage: "Accessibility permission is required to set values")
    let element = try currentElement(app: app, rawIndex: args["element_index"])
    guard let value = args["value"] as? String else {
        throw ToolError(code: "missing_value", message: "Missing required argument: value")
    }
    let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
    guard result == .success else {
        throw ToolError(code: "set_value_failed", message: "Unable to set AX value: \(result.rawValue)")
    }
    return actionResult("set_value", appQuery: query, app: app, result: [
        "method": "ax_set_value",
        "value": value,
    ])
}

func performSecondaryAction(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    let query = try appQuery(args)
    let app = try actionApp(args, permissionMessage: "Accessibility permission is required to perform actions")
    let element = try currentElement(app: app, rawIndex: args["element_index"])
    guard let action = args["action"] as? String else {
        throw ToolError(code: "missing_action", message: "Missing required argument: action")
    }
    let available = copyActionNames(element)
    let matched = available.first { $0 == action || $0.replacingOccurrences(of: "AX", with: "") == action }
    guard let matched else {
        throw ToolError(code: "unsupported_action", message: "Unsupported secondary action: \(action)")
    }
    let result = AXUIElementPerformAction(element, matched as CFString)
    guard result == .success else {
        throw ToolError(code: "secondary_action_failed", message: "Unable to perform action \(matched): \(result.rawValue)")
    }
    return actionResult("perform_secondary_action", appQuery: query, app: app, result: [
        "method": "ax_perform_action",
        "action": matched,
    ])
}

func performScroll(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    let query = try appQuery(args)
    let app = try actionApp(args, permissionMessage: "Accessibility permission is required to scroll")
    let element = try currentElement(app: app, rawIndex: args["element_index"])
    guard let direction = args["direction"] as? String else {
        throw ToolError(code: "missing_direction", message: "Missing required argument: direction")
    }
    let pages = max(1, intFromJSON(args["pages"]) ?? 1)
    let action: String
    switch direction.lowercased() {
    case "up":
        action = "AXScrollUpByPage"
    case "down":
        action = "AXScrollDownByPage"
    case "left":
        action = "AXScrollLeftByPage"
    case "right":
        action = "AXScrollRightByPage"
    default:
        throw ToolError(code: "unsupported_direction", message: "Unsupported scroll direction: \(direction)")
    }
    let center = elementCenter(element)
    var method = "ax_scroll_action"
    for _ in 0..<pages {
        if copyActionNames(element).contains(action) {
            let result = AXUIElementPerformAction(element, action as CFString)
            if result == .success {
                RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
                continue
            }
        }
        postScroll(at: center, direction: direction, pages: 1)
        method = "cg_event_scroll_wheel"
    }
    return actionResult("scroll", appQuery: query, app: app, result: [
        "method": method,
        "action": action,
        "pages": pages,
    ])
}

func rangeValue(location: Int, length: Int) -> AXValue? {
    var range = CFRange(location: location, length: length)
    return AXValueCreate(.cfRange, &range)
}

func performSelectText(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    let query = try appQuery(args)
    let app = try actionApp(args, permissionMessage: "Accessibility permission is required to select text")
    let element = try currentElement(app: app, rawIndex: args["element_index"])
    guard let text = args["text"] as? String else {
        throw ToolError(code: "missing_text", message: "Missing required argument: text")
    }
    let selection = (args["selection"] as? String) ?? "text"
    let value = (scalarAttribute(element, kAXValueAttribute) as? String) ?? ""
    guard let range = value.range(of: text) else {
        throw ToolError(code: "text_not_found", message: "Text not found in element value")
    }
    let utf16Start = value.utf16.distance(from: value.utf16.startIndex, to: range.lowerBound.samePosition(in: value.utf16)!)
    let utf16Length = text.utf16.count
    let location: Int
    let length: Int
    switch selection {
    case "cursor_before":
        location = utf16Start
        length = 0
    case "cursor_after":
        location = utf16Start + utf16Length
        length = 0
    default:
        location = utf16Start
        length = utf16Length
    }
    guard let axRange = rangeValue(location: location, length: length) else {
        throw ToolError(code: "range_create_failed", message: "Unable to create AX range")
    }
    let result = AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, axRange)
    guard result == .success else {
        throw ToolError(code: "select_text_failed", message: "Unable to set selected text range: \(result.rawValue)")
    }
    return actionResult("select_text", appQuery: query, app: app, result: [
        "method": "ax_selected_text_range",
        "location": location,
        "length": length,
        "selection": selection,
    ])
}

func performDrag(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    let query = try appQuery(args)
    let app = try actionApp(args, permissionMessage: "Accessibility permission is required to drag")
    guard let fromX = numberFromJSON(args["from_x"]),
          let fromY = numberFromJSON(args["from_y"]),
          let toX = numberFromJSON(args["to_x"]),
          let toY = numberFromJSON(args["to_y"])
    else {
        throw ToolError(code: "missing_drag_coordinates", message: "Drag requires from_x, from_y, to_x, and to_y")
    }
    let targetWindow = focusedWindowOrAppElement(pid: app.processIdentifier)
    let screenshot = captureWindowScreenshot(app: app, window: targetWindow)
    guard screenshot["status"] as? String == "captured",
          let from = screenshotPointToGlobal(fromX, fromY, screenshot: screenshot),
          let to = screenshotPointToGlobal(toX, toY, screenshot: screenshot)
    else {
        throw ToolError(code: "coordinate_mapping_failed", message: "Unable to map drag screenshot coordinates")
    }
    postDrag(from: from, to: to)
    return actionResult("drag", appQuery: query, app: app, result: [
        "method": "cg_event_drag",
        "from": pointDictionary(from),
        "to": pointDictionary(to),
    ])
}

func performTypeText(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    guard let appQuery = args["app"] as? String else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }
    guard let text = args["text"] as? String else {
        throw ToolError(code: "missing_text", message: "Missing required argument: text")
    }
    guard AXIsProcessTrusted() else {
        throw ToolError(
            code: "accessibility_permission_denied",
            message: "Accessibility permission is required to type text"
        )
    }

    let app = try resolveApp(appQuery)
    activateApp(app)
    postUnicodeText(text)
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))

    return [
        "ok": true,
        "source": "local-macos-keyboard-action",
        "action": "type_text",
        "app": [
            "query": appQuery,
            "name": app.localizedName ?? "",
            "bundleIdentifier": app.bundleIdentifier ?? "",
            "pid": app.processIdentifier,
        ],
        "result": [
            "method": "cg_event_unicode_keyboard",
            "characterCount": text.count,
        ],
    ]
}

func performPressKey(_ rawArguments: String) throws -> [String: Any] {
    let args = try parseActionArguments(rawArguments)
    guard let appQuery = args["app"] as? String else {
        throw ToolError(code: "missing_app", message: "Missing required argument: app")
    }
    guard let rawKey = args["key"] as? String else {
        throw ToolError(code: "missing_key", message: "Missing required argument: key")
    }
    guard AXIsProcessTrusted() else {
        throw ToolError(
            code: "accessibility_permission_denied",
            message: "Accessibility permission is required to press keys"
        )
    }

    let parsed = try parseKeyCombination(rawKey)
    guard let code = keyCode(for: parsed.key) else {
        throw ToolError(code: "unsupported_key", message: "Unsupported key: \(rawKey)")
    }

    let app = try resolveApp(appQuery)
    activateApp(app)
    let flags = cgFlags(from: parsed.modifiers)
    postKey(code: code, flags: flags)
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.15))

    return [
        "ok": true,
        "source": "local-macos-keyboard-action",
        "action": "press_key",
        "app": [
            "query": appQuery,
            "name": app.localizedName ?? "",
            "bundleIdentifier": app.bundleIdentifier ?? "",
            "pid": app.processIdentifier,
        ],
        "result": [
            "method": "cg_event_virtual_key",
            "key": parsed.key,
            "modifiers": Array(parsed.modifiers).sorted(),
            "keyCode": code,
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
    case "permissions":
        try writeJSON(permissionState())
    case "app-identity":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_app", message: "Missing required argument: app")
        }
        try writeJSON(try appIdentity(args.dropFirst().joined(separator: " ")))
    case "list-apps":
        try writeJSON(["ok": true, "apps": runningApps()])
    case "state":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_app", message: "Missing required argument: app")
        }
        try writeJSON(try appState(args.dropFirst().joined(separator: " ")))
    case "click":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing click action arguments")
        }
        try writeJSON(try performClick(args.dropFirst().joined(separator: " ")))
    case "type-text":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing type_text action arguments")
        }
        try writeJSON(try performTypeText(args.dropFirst().joined(separator: " ")))
    case "press-key":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing press_key action arguments")
        }
        try writeJSON(try performPressKey(args.dropFirst().joined(separator: " ")))
    case "set-value":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing set_value action arguments")
        }
        try writeJSON(try performSetValue(args.dropFirst().joined(separator: " ")))
    case "perform-secondary-action":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing perform_secondary_action arguments")
        }
        try writeJSON(try performSecondaryAction(args.dropFirst().joined(separator: " ")))
    case "scroll":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing scroll action arguments")
        }
        try writeJSON(try performScroll(args.dropFirst().joined(separator: " ")))
    case "select-text":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing select_text action arguments")
        }
        try writeJSON(try performSelectText(args.dropFirst().joined(separator: " ")))
    case "drag":
        guard args.count >= 2 else {
            throw ToolError(code: "missing_arguments", message: "Missing drag action arguments")
        }
        try writeJSON(try performDrag(args.dropFirst().joined(separator: " ")))
    default:
        throw ToolError(code: "usage", message: "Unknown command: \(command)")
    }
} catch let error as ToolError {
    fail(error.code, error.message)
} catch {
    fail("internal_error", error.localizedDescription)
}
