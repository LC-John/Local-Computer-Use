import AppKit
import ApplicationServices
import Darwin
import SwiftUI

struct AppStatus {
    var repoPath: String
    var pluginPath: String
    var gitCommit: String
    var accessibilityGranted: Bool
    var screenRecordingGranted: Bool
    var appHostSocketPath: String
    var appHostSocketExists: Bool
}

struct DiagnosticCommand: Identifiable {
    let id: String
    let title: String
    let group: String
    let command: [String]
}

struct CommandHistoryItem: Identifiable {
    let id = UUID()
    let title: String
    let command: String
    let startedAt: Date
    var finishedAt: Date?
    var exitSummary: String

    var durationText: String {
        guard let finishedAt else { return "running" }
        let duration = finishedAt.timeIntervalSince(startedAt)
        return String(format: "%.2fs", duration)
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var status: AppStatus
    @Published var isRunningCommand = false
    @Published var lastCommandTitle = "Ready"
    @Published var commandOutput = "Select a diagnostic to run."
    @Published var commandHistory: [CommandHistoryItem] = []

    private let repoURL: URL
    private let appHostSocketPath: String
    private var appHostProcess: Process?
    let diagnosticCommands: [DiagnosticCommand] = [
        DiagnosticCommand(
            id: "probe-local",
            title: "Smoke Test",
            group: "Smoke",
            command: ["npm", "run", "probe:local"]
        ),
        DiagnosticCommand(
            id: "probe-state-policy",
            title: "State Policy",
            group: "Smoke",
            command: ["npm", "run", "probe:m20:state-policy"]
        ),
        DiagnosticCommand(
            id: "probe-m22-app",
            title: "App Bundle",
            group: "App",
            command: ["npm", "run", "probe:m22:app"]
        ),
        DiagnosticCommand(
            id: "test-m13",
            title: "M13 Errors",
            group: "Fixture Gates",
            command: ["npm", "run", "test:m13:negative"]
        ),
        DiagnosticCommand(
            id: "test-followups",
            title: "Follow-ups",
            group: "Fixture Gates",
            command: ["npm", "run", "test:followups"]
        ),
        DiagnosticCommand(
            id: "test-m11",
            title: "M11 Full Suite",
            group: "Fixture Gates",
            command: ["npm", "run", "test:m11:fixtures"]
        ),
    ]

    init() {
        self.repoURL = Self.resolveRepoURL()
        self.appHostSocketPath = Self.defaultAppHostSocketPath()
        self.status = AppStatus(
            repoPath: repoURL.path,
            pluginPath: NSString(string: "~/plugins/local-computer-use").expandingTildeInPath,
            gitCommit: Self.runSync(["git", "rev-parse", "--short", "HEAD"], cwd: repoURL).trimmedFallback("unknown"),
            accessibilityGranted: AXIsProcessTrusted(),
            screenRecordingGranted: CGPreflightScreenCaptureAccess(),
            appHostSocketPath: appHostSocketPath,
            appHostSocketExists: FileManager.default.fileExists(atPath: appHostSocketPath)
        )
        startAppHostIfNeeded()
    }

    static func resolveRepoURL() -> URL {
        if let raw = ProcessInfo.processInfo.environment["LOCAL_CUA_REPO_ROOT"], !raw.isEmpty {
            return URL(fileURLWithPath: raw)
        }
        let buildURL = Bundle.main.bundleURL.deletingLastPathComponent()
        if buildURL.lastPathComponent == ".build" {
            return buildURL.deletingLastPathComponent()
        }
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    static func defaultAppHostSocketPath() -> String {
        let uid = getuid()
        return URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("local-computer-use-\(uid).sock")
            .path
    }

    func refreshStatus() {
        status = AppStatus(
            repoPath: repoURL.path,
            pluginPath: NSString(string: "~/plugins/local-computer-use").expandingTildeInPath,
            gitCommit: Self.runSync(["git", "rev-parse", "--short", "HEAD"], cwd: repoURL).trimmedFallback("unknown"),
            accessibilityGranted: AXIsProcessTrusted(),
            screenRecordingGranted: CGPreflightScreenCaptureAccess(),
            appHostSocketPath: appHostSocketPath,
            appHostSocketExists: FileManager.default.fileExists(atPath: appHostSocketPath)
        )
    }

    func startAppHostIfNeeded() {
        if appHostProcess?.isRunning == true {
            refreshStatus()
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", "src/app-host.mjs"]
        process.currentDirectoryURL = repoURL
        process.environment = ProcessInfo.processInfo.environment.merging([
            "LOCAL_CUA_REPO_ROOT": repoURL.path,
            "LOCAL_CUA_APP_SOCKET": appHostSocketPath,
            "LOCAL_CUA_APP_HOST_LOG": repoURL.appendingPathComponent("reports/app-host.log").path,
        ]) { _, new in new }

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            appHostProcess = process
            commandOutput = "Started app host at \(appHostSocketPath)."
        } catch {
            commandOutput = "Unable to start app host: \(error.localizedDescription)"
        }
        refreshStatus()
    }

    func openDocs() {
        NSWorkspace.shared.open(repoURL.appendingPathComponent("docs", isDirectory: true))
    }

    func openReports() {
        NSWorkspace.shared.open(repoURL.appendingPathComponent("reports", isDirectory: true))
    }

    func validatePluginManifest() {
        let validator = NSString(
            string: "~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py"
        ).expandingTildeInPath
        runCommand(title: "validate plugin", command: ["python3", validator, "."])
    }

    func runPluginFlowProbe() {
        runCommand(title: "plugin flow", command: ["npm", "run", "probe:m24:plugin-flow"])
    }

    func runDiagnostic(_ diagnostic: DiagnosticCommand) {
        runCommand(title: diagnostic.title, command: diagnostic.command)
    }

    private func runCommand(title: String, command: [String]) {
        guard !isRunningCommand else { return }
        isRunningCommand = true
        lastCommandTitle = title
        commandOutput = "Running \(command.joined(separator: " "))..."
        let startedAt = Date()
        let historyItem = CommandHistoryItem(
            title: title,
            command: command.joined(separator: " "),
            startedAt: startedAt,
            finishedAt: nil,
            exitSummary: "running"
        )
        commandHistory.insert(historyItem, at: 0)

        Task.detached { [repoURL] in
            let result = Self.runSyncResult(command, cwd: repoURL, timeoutSeconds: 180)
            await MainActor.run {
                self.commandOutput = result.output.isEmpty ? "(no output)" : result.output
                self.isRunningCommand = false
                if let index = self.commandHistory.firstIndex(where: { $0.id == historyItem.id }) {
                    self.commandHistory[index].finishedAt = Date()
                    self.commandHistory[index].exitSummary = result.exitCode == 0 ? "passed" : "failed \(result.exitCode)"
                }
                self.refreshStatus()
            }
        }
    }

    nonisolated static func runSync(_ command: [String], cwd: URL, timeoutSeconds: TimeInterval = 10) -> String {
        runSyncResult(command, cwd: cwd, timeoutSeconds: timeoutSeconds).output
    }

    nonisolated static func runSyncResult(_ command: [String], cwd: URL, timeoutSeconds: TimeInterval = 10) -> (output: String, exitCode: Int32) {
        guard let executable = command.first else { return ("", 0) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [executable] + command.dropFirst()
        process.currentDirectoryURL = cwd

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
        } catch {
            return (error.localizedDescription, 127)
        }

        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            process.terminate()
            return ("Timed out after \(Int(timeoutSeconds))s", 124)
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        if process.terminationStatus == 0 {
            return (text.trimmingCharacters(in: .whitespacesAndNewlines), process.terminationStatus)
        }
        return ("\(text.trimmingCharacters(in: .whitespacesAndNewlines))\n(exit \(process.terminationStatus))", process.terminationStatus)
    }
}

extension String {
    func trimmedFallback(_ fallback: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

struct StatusRow: View {
    let label: String
    let value: String
    let ok: Bool?

    var body: some View {
        HStack(spacing: 10) {
            if let ok {
                Circle()
                    .fill(ok ? Color.green : Color.red)
                    .frame(width: 9, height: 9)
            }
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 140, alignment: .leading)
            Text(value)
                .font(.system(size: 12, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
        }
    }
}

struct CommandHistoryRow: View {
    let item: CommandHistoryItem

    var body: some View {
        HStack(spacing: 8) {
            Text(item.exitSummary)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(item.exitSummary == "passed" ? Color.green : item.exitSummary == "running" ? Color.secondary : Color.red)
                .frame(width: 72, alignment: .leading)
            Text(item.title)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 110, alignment: .leading)
            Text(item.durationText)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .leading)
            Text(item.command)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
        }
    }
}

struct ContentView: View {
    @StateObject private var model = AppModel()

    private var groupedDiagnostics: [(String, [DiagnosticCommand])] {
        let grouped = Dictionary(grouping: model.diagnosticCommands, by: { $0.group })
        return grouped.keys.sorted().map { key in
            (key, grouped[key] ?? [])
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Local Computer Use Dev Manager")
                        .font(.system(size: 22, weight: .semibold))
                    Text("Developer diagnostics for the local MCP reimplementation")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Refresh") {
                    model.refreshStatus()
                }
            }

        GroupBox("Status") {
                VStack(alignment: .leading, spacing: 8) {
                    StatusRow(label: "Repo", value: model.status.repoPath, ok: nil)
                    StatusRow(label: "Plugin symlink", value: model.status.pluginPath, ok: FileManager.default.fileExists(atPath: model.status.pluginPath))
                    StatusRow(label: "Git commit", value: model.status.gitCommit, ok: nil)
                    StatusRow(label: "Accessibility", value: model.status.accessibilityGranted ? "granted" : "missing", ok: model.status.accessibilityGranted)
                    StatusRow(label: "Screen Recording", value: model.status.screenRecordingGranted ? "granted" : "missing", ok: model.status.screenRecordingGranted)
                    StatusRow(label: "MCP app host", value: model.status.appHostSocketPath, ok: model.status.appHostSocketExists)
                }
                .padding(.vertical, 6)
            }

            GroupBox("Diagnostics") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(groupedDiagnostics, id: \.0) { group, commands in
                        HStack(spacing: 10) {
                            Text(group)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 92, alignment: .leading)
                            ForEach(commands) { command in
                                Button(command.title) {
                                    model.runDiagnostic(command)
                                }
                            }
                            Spacer()
                        }
                    }
                    Divider()
                    HStack(spacing: 10) {
                        Text("Plugin")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 92, alignment: .leading)
                        Button("Validate Plugin") {
                            model.validatePluginManifest()
                        }
                        Button("Plugin Flow") {
                            model.runPluginFlowProbe()
                        }
                        Button("Start Host") {
                            model.startAppHostIfNeeded()
                        }
                        Spacer()
                        Button("Open Docs") {
                            model.openDocs()
                        }
                        Button("Open Reports") {
                            model.openReports()
                        }
                    }
                }
                .disabled(model.isRunningCommand)
                .padding(.vertical, 6)
            }

            GroupBox(model.lastCommandTitle) {
                ScrollView {
                    Text(model.commandOutput)
                        .font(.system(size: 12, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(8)
                }
                .frame(minHeight: 180)
            }

            GroupBox("Command History") {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        if model.commandHistory.isEmpty {
                            Text("No commands run yet.")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            ForEach(model.commandHistory) { item in
                                CommandHistoryRow(item: item)
                            }
                        }
                    }
                    .padding(8)
                }
                .frame(height: 120)
            }
        }
        .padding(18)
        .frame(minWidth: 820, minHeight: 680)
    }
}

@main
struct LocalComputerUseDevManagerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowStyle(.titleBar)
    }
}
