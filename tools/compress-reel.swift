import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count == 3 else {
    fputs("usage: compress-reel input.mp4 output.mp4\n", stderr)
    exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let asset = AVURLAsset(url: input)
let limit = 10 * 1024 * 1024
let presets = [
    AVAssetExportPreset1280x720,
    AVAssetExportPreset960x540,
    AVAssetExportPreset640x480,
    AVAssetExportPresetLowQuality,
]

func export(preset: String, to url: URL) -> Bool {
    try? FileManager.default.removeItem(at: url)
    guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
        fputs("preset unavailable: \(preset)\n", stderr)
        return false
    }
    session.outputURL = url
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    let wait = DispatchSemaphore(value: 0)
    session.exportAsynchronously { wait.signal() }
    wait.wait()
    if session.status != .completed {
        fputs("export \(preset) failed: \(session.error?.localizedDescription ?? "unknown")\n", stderr)
        return false
    }
    return true
}

var wrote = false
for preset in presets {
    let temp = output.deletingLastPathComponent().appendingPathComponent("pass-\(preset).mp4")
    if !export(preset: preset, to: temp) { continue }
    let size = (try? FileManager.default.attributesOfItem(atPath: temp.path)[.size] as? NSNumber)?.intValue ?? 0
    fputs("preset \(preset) bytes \(size)\n", stderr)
    if size > 0 && size <= limit {
        try? FileManager.default.removeItem(at: output)
        do {
            try FileManager.default.moveItem(at: temp, to: output)
        } catch {
            fputs("move failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        wrote = true
        break
    }
    try? FileManager.default.removeItem(at: output)
    do {
        try FileManager.default.moveItem(at: temp, to: output)
    } catch {
        fputs("move failed: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
    wrote = true
}
if !wrote {
    fputs("no export produced a file\n", stderr)
    exit(1)
}
let finalSize = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.intValue ?? 0
print("compressed \(finalSize)")
if finalSize > limit { exit(1) }
