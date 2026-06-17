import AppKit
import ApplicationServices
import SwiftUI

struct AppStatus {
    var repoPath: String
    var pluginPath: String
    var gitCommit: String
    var accessibilityGranted: Bool
    var screenRecordingGranted: Bool
}

@MainActor
final class AppModel: ObservableObject {
    @Published var status: AppStatus
    @Published var isRunningCommand = false
    @Published var lastCommandTitle = "Ready"
    @Published var commandOutput = "Select a diagnostic to run."

    private let repoURL: URL

    init() {
        self.repoURL = Self.resolveRepoURL()
        self.status = AppStatus(
            repoPath: repoURL.path,
            pluginPath: NSString(string: "~/plugins/local-computer-use").expandingTildeInPath,
            gitCommit: Self.runSync(["git", "rev-parse", "--short", "HEAD"], cwd: repoURL).trimmedFallback("unknown"),
            accessibilityGranted: AXIsProcessTrusted(),
            screenRecordingGranted: CGPreflightScreenCaptureAccess()
        )
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

    func refreshStatus() {
        status = AppStatus(
            repoPath: repoURL.path,
            pluginPath: NSString(string: "~/plugins/local-computer-use").expandingTildeInPath,
            gitCommit: Self.runSync(["git", "rev-parse", "--short", "HEAD"], cwd: repoURL).trimmedFallback("unknown"),
            accessibilityGranted: AXIsProcessTrusted(),
            screenRecordingGranted: CGPreflightScreenCaptureAccess()
        )
    }

    func openDocs() {
        NSWorkspace.shared.open(repoURL.appendingPathComponent("docs", isDirectory: true))
    }

    func openReports() {
        NSWorkspace.shared.open(repoURL.appendingPathComponent("reports", isDirectory: true))
    }

    func runProbeLocal() {
        runCommand(title: "probe:local", command: ["npm", "run", "probe:local"])
    }

    func runStatePolicyProbe() {
        runCommand(title: "probe:m20:state-policy", command: ["npm", "run", "probe:m20:state-policy"])
    }

    func validatePluginManifest() {
        let validator = NSString(
            string: "~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py"
        ).expandingTildeInPath
        runCommand(title: "validate plugin", command: ["python3", validator, "."])
    }

    private func runCommand(title: String, command: [String]) {
        guard !isRunningCommand else { return }
        isRunningCommand = true
        lastCommandTitle = title
        commandOutput = "Running \(command.joined(separator: " "))..."

        Task.detached { [repoURL] in
            let output = Self.runSync(command, cwd: repoURL, timeoutSeconds: 120)
            await MainActor.run {
                self.commandOutput = output.isEmpty ? "(no output)" : output
                self.isRunningCommand = false
                self.refreshStatus()
            }
        }
    }

    nonisolated static func runSync(_ command: [String], cwd: URL, timeoutSeconds: TimeInterval = 10) -> String {
        guard let executable = command.first else { return "" }
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
            return error.localizedDescription
        }

        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            process.terminate()
            return "Timed out after \(Int(timeoutSeconds))s"
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        if process.terminationStatus == 0 {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return "\(text.trimmingCharacters(in: .whitespacesAndNewlines))\n(exit \(process.terminationStatus))"
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

struct ContentView: View {
    @StateObject private var model = AppModel()

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
                }
                .padding(.vertical, 6)
            }

            GroupBox("Diagnostics") {
                HStack(spacing: 10) {
                    Button("Smoke Test") {
                        model.runProbeLocal()
                    }
                    Button("State Policy") {
                        model.runStatePolicyProbe()
                    }
                    Button("Validate Plugin") {
                        model.validatePluginManifest()
                    }
                    Spacer()
                    Button("Open Docs") {
                        model.openDocs()
                    }
                    Button("Open Reports") {
                        model.openReports()
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
        }
        .padding(18)
        .frame(minWidth: 760, minHeight: 520)
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
