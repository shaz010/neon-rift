import AVFoundation
import UIKit

/// Playback-category bed plus shot and explosion voices. Silent-switch safe
/// because the session is `.playback` before the engine starts.
final class FlightAudio {
    private let engine = AVAudioEngine()
    private let box = UnsafeMutablePointer<AudioBox>.allocate(capacity: 1)
    private var started = false

    init() {
        box.initialize(to: AudioBox())
    }

    func startIfNeeded() {
        guard !started else { return }
        AudioSession.engage()
        let session = AVAudioSession.sharedInstance()
        let rate = session.sampleRate > 8_000 ? session.sampleRate : 44_100
        box.pointee.rate = Float(rate)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2) else { return }
        let state = box
        let source = AVAudioSourceNode(format: format) { isSilence, _, frameCount, abl in
            isSilence.pointee = ObjCBool(false)
            let local = state.pointee
            let buffers = UnsafeMutableAudioBufferListPointer(abl)
            let frames = Int(frameCount)
            let dt = 1 / max(local.rate, 8_000)
            let thrust = local.thrust
            var endPhase = local.phase
            var endN = local.nstate
            var endShot = local.shot
            var endBoom = local.boom
            var endSting = local.sting
            var endLaunch = local.launch
            for buffer in buffers {
                guard let data = buffer.mData else { continue }
                let ptr = data.assumingMemoryBound(to: Float.self)
                let channels = Int(buffer.mNumberChannels)
                var phase = local.phase
                var nstate = local.nstate
                var shot = local.shot
                var boom = local.boom
                var sting = local.sting
                var launch = local.launch
                for i in 0..<frames {
                    phase += dt * (48 + thrust * 36)
                    if phase > 8 { phase -= 8 }
                    var seed = nstate &* 747796405 &+ 2891336453
                    nstate = seed
                    seed = (seed >> ((seed >> 28) &+ 4)) ^ seed &* 277803737
                    let noise = Float(Int32(bitPattern: seed)) / Float(Int32.max)
                    let hum = sin(phase * 2 * .pi) * (0.045 + thrust * 0.11)
                        + sin(phase * 4 * .pi) * thrust * 0.03
                    shot *= 0.992
                    boom *= 0.997
                    sting *= 0.996
                    launch *= 0.9992
                    let crack = noise * shot * 0.22
                    let rumble = noise * boom * (0.18 + 0.1 * sin(phase * 0.35))
                    let hit = sin(phase * 1.4 * .pi) * sting * 0.16
                    let rise = sin(phase * (1.2 + launch) * .pi) * launch * 0.07
                    let sample = (hum + crack + rumble + hit + rise) * 0.85
                    if channels <= 1 {
                        ptr[i] = sample
                    } else {
                        for c in 0..<channels {
                            ptr[i * channels + c] = sample
                        }
                    }
                }
                endPhase = phase
                endN = nstate
                endShot = shot
                endBoom = boom
                endSting = sting
                endLaunch = launch
            }
            state.pointee.phase = endPhase
            state.pointee.nstate = endN
            state.pointee.shot = endShot
            state.pointee.boom = endBoom
            state.pointee.sting = endSting
            state.pointee.launch = endLaunch
            return noErr
        }
        engine.attach(source)
        engine.connect(source, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.9
        engine.prepare()
        do {
            try engine.start()
            started = true
        } catch {
            NSLog("Neon Rift 2 audio engine: \(error.localizedDescription)")
        }
    }

    func setThrust(_ value: Float) { box.pointee.thrust = min(1, max(0, value)) }
    func setLaunch(_ value: Float) { box.pointee.launch = min(1, max(box.pointee.launch, value)) }
    func shot() { box.pointee.shot = 1 }
    func explosion() { box.pointee.boom = 1 }
    func titleHit() { box.pointee.sting = 1 }

    deinit {
        engine.stop()
        box.deinitialize(count: 1)
        box.deallocate()
    }
}

private struct AudioBox {
    var thrust: Float = 0
    var shot: Float = 0
    var boom: Float = 0
    var sting: Float = 0
    var launch: Float = 0
    var phase: Float = 0
    var nstate: UInt32 = 0x1234_5678
    var rate: Float = 44_100
}

final class FlightHaptics {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private var shotGate = 0

    init() {
        light.prepare()
        rigid.prepare()
        heavy.prepare()
    }

    func shot() {
        shotGate += 1
        if shotGate % 3 != 0 { return }
        light.impactOccurred(intensity: 0.55)
        light.prepare()
    }

    func pickup() {
        light.impactOccurred(intensity: 0.7)
        light.prepare()
    }

    func hit() {
        rigid.impactOccurred(intensity: 0.9)
        rigid.prepare()
    }

    func boom() {
        heavy.impactOccurred(intensity: 1)
        heavy.prepare()
    }

    func launch() {
        rigid.impactOccurred(intensity: 0.65)
        rigid.prepare()
    }
}
