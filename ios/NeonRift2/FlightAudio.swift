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
            var endChime = local.chime
            var endMusicPhase = local.musicPhase
            var endLockPhase = local.lockPhase
            var endZap = local.zap
            var endShotPhase = local.shotPhase
            let music = local.music
            let beam = local.beam
            let lock = local.lock
            let shotTone = max(0.5, local.shotTone)
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
                var chime = local.chime
                var musicPhase = local.musicPhase
                var lockPhase = local.lockPhase
                var zap = local.zap
                var shotPhase = local.shotPhase
                for i in 0..<frames {
                    phase += dt * (52 + thrust * 70)
                    if phase > 8 { phase -= 8 }
                    musicPhase += dt * (1.15 + music * 1.7)
                    var seed = nstate &* 747796405 &+ 2891336453
                    nstate = seed
                    seed = (seed >> ((seed >> 28) &+ 4)) ^ seed &* 277803737
                    let noise = Float(Int32(bitPattern: seed)) / Float(Int32.max)
                    let hum = sin(phase * 2 * .pi) * (0.04 + thrust * 0.16)
                        + sin(phase * 3 * .pi) * thrust * 0.05
                    let thumpK: Float = exp(-dt / 0.09)
                    let zapK: Float = exp(-dt / 0.032)
                    shot *= thumpK
                    zap *= zapK
                    shotPhase += dt
                    boom *= 0.9965
                    sting *= 0.996
                    launch *= 0.9992
                    chime *= 0.994
                    let thump = sin(shotPhase * 2 * .pi * (72 * shotTone)) * shot * 0.26
                        + sin(shotPhase * 2 * .pi * (38 * shotTone)) * shot * shot * 0.18
                    let bite = sin(shotPhase * 2 * .pi * (1760 * shotTone)) * zap * 0.055
                        + sin(shotPhase * 2 * .pi * (2480 * shotTone)) * zap * zap * 0.028
                    let crack = thump + bite + noise * zap * shot * 0.03
                    let rumble = noise * boom * (0.28 + 0.16 * sin(phase * 0.22))
                    let hit = sin(phase * 1.4 * .pi) * sting * 0.16
                    let rise = sin(phase * (1.2 + launch) * .pi) * launch * 0.08
                    let bell = sin(musicPhase * 880 * .pi) * chime * 0.12
                        + sin(musicPhase * 1320 * .pi) * chime * 0.05
                    let tow = sin(phase * 6 * .pi) * beam * (0.04 + 0.03 * sin(phase * 0.5))
                    let pulse = max(0, sin(musicPhase * 2 * .pi))
                    let bed = sin(musicPhase * 2 * .pi * (92 + music * 70)) * pulse * (0.012 + music * 0.05)
                    lockPhase += dt * (7 + lock * 8)
                    var gate: Float = 0
                    if sin(lockPhase * 2 * .pi) > 0.45 { gate = 1 }
                    let seeker = gate * sin(lockPhase * 16 * .pi) * lock * 0.055
                    let sample = (hum + crack + rumble + hit + rise + bell + tow + bed + seeker) * 0.9
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
                endChime = chime
                endMusicPhase = musicPhase
                endLockPhase = lockPhase
                endZap = zap
                endShotPhase = shotPhase
            }
            state.pointee.phase = endPhase
            state.pointee.nstate = endN
            state.pointee.shot = endShot
            state.pointee.boom = endBoom
            state.pointee.sting = endSting
            state.pointee.launch = endLaunch
            state.pointee.chime = endChime
            state.pointee.musicPhase = endMusicPhase
            state.pointee.lockPhase = endLockPhase
            state.pointee.zap = endZap
            state.pointee.shotPhase = endShotPhase
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
    func setMusic(_ value: Float) { box.pointee.music = min(1, max(0, value)) }
    func setBeam(_ value: Float) { box.pointee.beam = min(1, max(0, value)) }
    func setLock(_ value: Float) { box.pointee.lock = min(1, max(0, value)) }
    func shot() {
        box.pointee.shot = 1
        box.pointee.zap = 1
        box.pointee.shotPhase = 0
        box.pointee.shotTone = Float.random(in: 0.92...1.08)
    }
    func explosion() { box.pointee.boom = 1 }
    func titleHit() { box.pointee.sting = 1 }
    func chime() { box.pointee.chime = 1 }

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
    var chime: Float = 0
    var beam: Float = 0
    var music: Float = 0
    var musicPhase: Float = 0
    var lock: Float = 0
    var lockPhase: Float = 0
    var zap: Float = 0
    var shotPhase: Float = 0
    var shotTone: Float = 1
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
        rigid.impactOccurred(intensity: shotGate % 2 == 0 ? 0.72 : 0.5)
        rigid.prepare()
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
