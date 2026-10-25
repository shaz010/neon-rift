import AVFoundation
import AudioToolbox
import CoreMedia
import CoreVideo
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

func fileSize(_ url: URL) -> Int {
    (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
}

func even(_ value: CGFloat) -> Int {
    let n = Int(value.rounded(.down))
    return max(2, n - (n % 2))
}

func fitTransform(_ track: AVAssetTrack, target: CGSize) -> CGAffineTransform {
    let transformed = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    let scaleX = target.width / max(abs(transformed.width), 1)
    let scaleY = target.height / max(abs(transformed.height), 1)
    let translate = CGAffineTransform(translationX: -transformed.origin.x, y: -transformed.origin.y)
    let scale = CGAffineTransform(scaleX: scaleX, y: scaleY)
    return track.preferredTransform.concatenating(translate).concatenating(scale)
}

func encode(maxWidth: CGFloat, maxKeep: Double, to url: URL) -> Bool {
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
        fputs("no video track\n", stderr)
        return false
    }
    let oriented = CGRect(origin: .zero, size: videoTrack.naturalSize).applying(videoTrack.preferredTransform)
    let sourceWidth = abs(oriented.width)
    let sourceHeight = abs(oriented.height)
    guard sourceWidth > 1, sourceHeight > 1 else { return false }
    let scale = min(1, maxWidth / sourceWidth)
    let width = even(sourceWidth * scale)
    let height = even(sourceHeight * scale)
    let full = max(CMTimeGetSeconds(asset.duration), 1)
    let keepSeconds = min(full, maxKeep)
    let keep = CMTime(seconds: keepSeconds, preferredTimescale: 600)
    let videoBitrate = max(180_000, Int((Double(limit - 400 * 1024) * 8 * 0.85) / keepSeconds))
    fputs("encode \(width)x\(height) bitrate \(videoBitrate) keep \(String(format: "%.1f", keepSeconds)) of \(String(format: "%.1f", full))\n", stderr)

    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: width, height: height)
    composition.frameDuration = CMTime(value: 1, timescale: 30)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: keep)
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    layerInstruction.setTransform(fitTransform(videoTrack, target: composition.renderSize), at: .zero)
    instruction.layerInstructions = [layerInstruction]
    composition.instructions = [instruction]

    guard let reader = try? AVAssetReader(asset: asset) else { return false }
    reader.timeRange = CMTimeRange(start: .zero, duration: keep)
    let formats = [
        kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
        kCVPixelFormatType_32BGRA,
    ]
    var videoOutput: AVAssetReaderVideoCompositionOutput?
    for format in formats {
        let candidate = AVAssetReaderVideoCompositionOutput(videoTracks: [videoTrack], videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: format,
        ])
        candidate.videoComposition = composition
        candidate.alwaysCopiesSampleData = true
        if reader.canAdd(candidate) {
            reader.add(candidate)
            videoOutput = candidate
            break
        }
    }
    guard let videoOutput else {
        fputs("no video reader output\n", stderr)
        return false
    }

    try? FileManager.default.removeItem(at: url)
    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: videoBitrate,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: 30,
        ],
    ])
    videoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput) else { return false }
    writer.add(videoInput)

    var audioOutput: AVAssetReaderTrackOutput?
    var audioInput: AVAssetWriterInput?
    if let audioTrack = asset.tracks(withMediaType: .audio).first {
        let candidate = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
        ])
        candidate.expectsMediaDataInRealTime = false
        let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ])
        if writer.canAdd(candidate), reader.canAdd(readerOutput) {
            writer.add(candidate)
            reader.add(readerOutput)
            audioInput = candidate
            audioOutput = readerOutput
        }
    }

    guard writer.startWriting() else {
        fputs("writer start failed: \(writer.error?.localizedDescription ?? "unknown")\n", stderr)
        return false
    }
    writer.startSession(atSourceTime: .zero)
    guard reader.startReading() else {
        fputs("reader start failed: \(reader.error?.localizedDescription ?? "unknown")\n", stderr)
        return false
    }

    let group = DispatchGroup()
    group.enter()
    var videoOpen = true
    videoInput.requestMediaDataWhenReady(on: DispatchQueue(label: "nr2.compress.video")) {
        guard videoOpen else { return }
        while videoInput.isReadyForMoreMediaData {
            let sample = videoOutput.copyNextSampleBuffer()
            if let sample, videoInput.append(sample) { continue }
            videoOpen = false
            videoInput.markAsFinished()
            group.leave()
            return
        }
    }
    if let audioOutput, let audioInput {
        group.enter()
        var audioOpen = true
        audioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "nr2.compress.audio")) {
            guard audioOpen else { return }
            while audioInput.isReadyForMoreMediaData {
                let sample = audioOutput.copyNextSampleBuffer()
                if let sample, audioInput.append(sample) { continue }
                audioOpen = false
                audioInput.markAsFinished()
                group.leave()
                return
            }
        }
    }

    if group.wait(timeout: .now() + 240) == .timedOut {
        fputs("encode timed out\n", stderr)
        reader.cancelReading()
        writer.cancelWriting()
        return false
    }
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    finished.wait()
    if writer.status != .completed {
        fputs("finish failed: \(writer.error?.localizedDescription ?? "unknown")\n", stderr)
        return false
    }
    return fileSize(url) > 0
}

let pass = output.deletingLastPathComponent().appendingPathComponent("pass-fit.mp4")
let plans: [(CGFloat, Double)] = [(720, 80), (540, 48), (480, 24)]
var size = 0
var wrote = false
for plan in plans {
    try? FileManager.default.removeItem(at: pass)
    if !encode(maxWidth: plan.0, maxKeep: plan.1, to: pass) { continue }
    size = fileSize(pass)
    fputs("fit \(Int(plan.0)) keep \(Int(plan.1)) bytes \(size)\n", stderr)
    if size > 0 { wrote = true }
    if size > 0 && size <= limit { break }
}
if !wrote || size <= 0 {
    fputs("fit encode produced no file\n", stderr)
    exit(1)
}
if size > limit {
    fputs("clip is over 10MB (\(size)); keeping it so TestFlight is not blocked\n", stderr)
}
try? FileManager.default.removeItem(at: output)
do {
    try FileManager.default.moveItem(at: pass, to: output)
} catch {
    fputs("move failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
print("compressed \(size)")
