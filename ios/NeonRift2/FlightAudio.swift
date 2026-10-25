import AudioToolbox
import AVFoundation
import UIKit

/// Recorded cannon, crack, blast, and engine samples (Kenney Sci-fi Sounds, CC0)
/// through a compressor. A quiet synth bed stays underneath. Silent-switch safe
/// because the session is `.playback` before the engine starts.
/// Logic Pro WAVs for pulse, arc, beam, phaser, hit, and explosion can replace
/// these buffers at the load site when the owner delivers them.
final class FlightAudio {
    private let engine = AVAudioEngine()
    private let box = UnsafeMutablePointer<AudioBox>.allocate(capacity: 1)
    private let bus = AVAudioMixerNode()
    private let compressor = FlightAudio.makeCompressor()
    private let engineVoice = AVAudioPlayerNode()
    private var shotVoices: [AVAudioPlayerNode] = []
    private var boomVoices: [AVAudioPlayerNode] = []
    private var shotCursor = 0
    private var boomCursor = 0
    private var cannon: AVAudioPCMBuffer?
    private var cannonLow: AVAudioPCMBuffer?
    private var crack: AVAudioPCMBuffer?
    private var boomBuffer: AVAudioPCMBuffer?
    private var engineLoop: AVAudioPCMBuffer?
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
            var endCrackle = local.crackle
            var endBoomPhase = local.boomPhase
            var endBody = local.body
            var endBodyPhase = local.bodyPhase
            let music = local.music
            let beam = local.beam
            let lock = local.lock
            let shotTone = max(0.5, local.shotTone)
            let shotKind = local.shotKind
            let boomTone = max(0.5, local.boomTone)
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
                var crackle = local.crackle
                var boomPhase = local.boomPhase
                var body = local.body
                var bodyPhase = local.bodyPhase
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
                    let shotTau: Float = shotKind > 2.5 ? 0.18 : (shotKind > 0.5 && shotKind < 1.5 ? 0.1 : 0.12)
                    let zapTau: Float = shotKind > 0.5 && shotKind < 1.5 ? 0.06 : 0.034
                    let shotK: Float = exp(-dt / shotTau)
                    let zapK: Float = exp(-dt / zapTau)
                    let boomK: Float = exp(-dt / 0.28)
                    let bodyK: Float = exp(-dt / 0.17)
                    let crackK: Float = exp(-dt / 0.09)
                    shot *= shotK
                    zap *= zapK
                    crackle *= crackK
                    boom *= boomK
                    body *= bodyK
                    shotPhase += dt
                    boomPhase += dt
                    bodyPhase += dt
                    sting *= 0.996
                    launch *= 0.9992
                    chime *= 0.994
                    let crack: Float
                    if shotKind < 0.5 {
                        let sub = sin(shotPhase * 2 * .pi * (44 * shotTone)) * shot * 0.32
                        let chest = sin(shotPhase * 2 * .pi * (88 * shotTone)) * shot * shot * 0.18
                        let mid = sin(shotPhase * 2 * .pi * (230 * shotTone)) * zap * 0.06
                        let bite = sin(shotPhase * 2 * .pi * (1540 * shotTone)) * zap * 0.05
                            + sin(shotPhase * 2 * .pi * (2320 * shotTone)) * zap * zap * 0.02
                        crack = sub + chest + mid + bite + noise * zap * 0.035
                    } else if shotKind < 1.5 {
                        let sweep = 2400 * shotTone - shotPhase * 1400
                        let spark = sin(shotPhase * 2 * .pi * max(Float(180), sweep)) * zap * 0.08
                        let gate: Float = sin(shotPhase * 2 * .pi * 90) > 0.2 ? 1 : 0.12
                        let ticks = noise * gate * crackle * 0.18
                        let tick = sin(shotPhase * 2 * .pi * (160 * shotTone)) * shot * 0.1
                        crack = spark + ticks + tick
                    } else if shotKind < 2.5 {
                        let fundamental = sin(shotPhase * 2 * .pi * (720 * shotTone)) * shot * 0.11
                        let overtone = sin(shotPhase * 2 * .pi * (1440 * shotTone)) * zap * 0.04
                        let sub = sin(shotPhase * 2 * .pi * (62 * shotTone)) * shot * 0.14
                        crack = fundamental + overtone + sub
                    } else {
                        let laser = sin(shotPhase * 2 * .pi * (480 * shotTone)) * shot * 0.13
                            + sin(shotPhase * 2 * .pi * (960 * shotTone)) * zap * 0.045
                        crack = laser + noise * zap * 0.03
                    }
                    let thunder = sin(boomPhase * 2 * .pi * (36 * boomTone)) * boom * 0.34
                        + sin(boomPhase * 2 * .pi * (72 * boomTone)) * boom * boom * 0.15
                        + noise * boom * 0.09
                    let punch = sin(bodyPhase * 2 * .pi * 50) * body * 0.28
                        + noise * body * 0.05
                    let hit = sin(phase * 1.4 * .pi) * sting * 0.16
                    let rise = sin(phase * (1.2 + launch) * .pi) * launch * 0.08
                    let bell = sin(musicPhase * 880 * .pi) * chime * 0.12
                        + sin(musicPhase * 1320 * .pi) * chime * 0.05
                    let tow = sin(phase * 6 * .pi) * beam * (0.04 + 0.03 * sin(phase * 0.5))
                    let pulse = max(0, sin(musicPhase * 2 * .pi))
                    let bed = sin(musicPhase * 2 * .pi * (92 + music * 70)) * pulse * (0.006 + music * 0.018)
                    lockPhase += dt * (7 + lock * 8)
                    var gate: Float = 0
                    if sin(lockPhase * 2 * .pi) > 0.45 { gate = 1 }
                    let seeker = gate * sin(lockPhase * 16 * .pi) * lock * 0.055
                    // Weapon voices are recorded samples. The synth shot, blast, and seeker stay silent.
                    let voiced = hum + crack + thunder + punch + seeker
                    let sample = (hit + rise + bell + tow + bed) * 0.45 + voiced * 0
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
                endCrackle = crackle
                endBoomPhase = boomPhase
                endBody = body
                endBodyPhase = bodyPhase
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
            state.pointee.crackle = endCrackle
            state.pointee.boomPhase = endBoomPhase
            state.pointee.body = endBody
            state.pointee.bodyPhase = endBodyPhase
            return noErr
        }
        cannon = Self.loadSample("cannon")
        cannonLow = Self.loadSample("cannon-low")
        crack = Self.loadSample("crack")
        boomBuffer = Self.loadSample("boom")
        engineLoop = Self.loadSample("engine")
        tuneCompressor()
        engine.attach(source)
        engine.attach(bus)
        engine.attach(compressor)
        engine.attach(engineVoice)
        shotVoices = (0..<6).map { _ in AVAudioPlayerNode() }
        boomVoices = (0..<3).map { _ in AVAudioPlayerNode() }
        for voice in shotVoices + boomVoices { engine.attach(voice) }
        engine.connect(source, to: bus, format: format)
        engine.connect(engineVoice, to: bus, format: engineLoop?.format ?? format)
        let shotFormat = cannon?.format ?? crack?.format ?? format
        for voice in shotVoices { engine.connect(voice, to: bus, format: shotFormat) }
        let boomFormat = boomBuffer?.format ?? format
        for voice in boomVoices { engine.connect(voice, to: bus, format: boomFormat) }
        engine.connect(bus, to: compressor, format: format)
        engine.connect(compressor, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.95
        engine.prepare()
        do {
            try engine.start()
            started = true
            if let engineLoop {
                engineVoice.volume = 0.22
                engineVoice.scheduleBuffer(engineLoop, at: nil, options: .loops)
                engineVoice.play()
            }
        } catch {
            NSLog("Neon Rift 2 audio engine: \(error.localizedDescription)")
        }
    }

    func setThrust(_ value: Float) {
        let v = min(1, max(0, value))
        box.pointee.thrust = v
        guard started else { return }
        engineVoice.volume = 0.2 + v * 0.75
    }
    func setLaunch(_ value: Float) { box.pointee.launch = min(1, max(box.pointee.launch, value)) }
    func setMusic(_ value: Float) { box.pointee.music = min(1, max(0, value)) }
    func setBeam(_ value: Float) { box.pointee.beam = min(1, max(0, value)) }
    func setLock(_ value: Float) { box.pointee.lock = min(1, max(0, value)) }
    /// 0 pulse cannon, 1 energy crack, 2 beam crack, 3 phaser crack plus blast.
    func shot(_ kind: Int) {
        switch kind {
        case 1:
            play(crack, cursor: &shotCursor, voices: shotVoices, volume: 0.92)
        case 2:
            play(crack, cursor: &shotCursor, voices: shotVoices, volume: 0.7)
        case 3:
            play(crack, cursor: &shotCursor, voices: shotVoices, volume: 1)
            play(boomBuffer, cursor: &boomCursor, voices: boomVoices, volume: 0.62)
        default:
            let body = (shotCursor % 2 == 0) ? (cannon ?? cannonLow) : (cannonLow ?? cannon)
            play(body, cursor: &shotCursor, voices: shotVoices, volume: 1)
        }
    }
    func explosion(power: Float = 1) {
        play(boomBuffer, cursor: &boomCursor, voices: boomVoices, volume: min(1, 0.58 + power * 0.42))
    }
    func impact() {
        play(cannon ?? cannonLow, cursor: &shotCursor, voices: shotVoices, volume: 0.7)
    }

    private func play(_ buffer: AVAudioPCMBuffer?, cursor: inout Int, voices: [AVAudioPlayerNode], volume: Float) {
        guard started, let buffer, !voices.isEmpty else { return }
        let voice = voices[cursor % voices.count]
        cursor = (cursor + 1) % max(1, voices.count)
        voice.volume = volume
        voice.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        if !voice.isPlaying { voice.play() }
    }

    /// Apple's Dynamics Processor audio unit. The old Swift wrapper is gone from the iOS 26 SDK.
    private static func makeCompressor() -> AVAudioUnitEffect {
        let description = AudioComponentDescription(
            componentType: kAudioUnitType_Effect,
            componentSubType: kAudioUnitSubType_DynamicsProcessor,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )
        return AVAudioUnitEffect(audioComponentDescription: description)
    }

    private func tuneCompressor() {
        let unit = compressor.audioUnit
        // Threshold, headroom, attack, release, makeup gain.
        AudioUnitSetParameter(unit, 0, kAudioUnitScope_Global, 0, -16, 0)
        AudioUnitSetParameter(unit, 1, kAudioUnitScope_Global, 0, 6, 0)
        AudioUnitSetParameter(unit, 4, kAudioUnitScope_Global, 0, 0.005, 0)
        AudioUnitSetParameter(unit, 5, kAudioUnitScope_Global, 0, 0.14, 0)
        AudioUnitSetParameter(unit, 6, kAudioUnitScope_Global, 0, 3, 0)
    }

    private static func loadSample(_ name: String) -> AVAudioPCMBuffer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else {
            NSLog("Neon Rift 2 missing \(name).wav")
            return nil
        }
        do {
            let file = try AVAudioFile(forReading: url)
            let frames = AVAudioFrameCount(file.length)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames) else { return nil }
            try file.read(into: buffer)
            return buffer
        } catch {
            NSLog("Neon Rift 2 sample \(name): \(error.localizedDescription)")
            return nil
        }
    }
    func titleHit() { box.pointee.sting = 1 }
    func chime() { box.pointee.chime = 1 }

    func stop() {
        guard started else { return }
        engine.stop()
        started = false
    }

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
    var shotKind: Float = 0
    var crackle: Float = 0
    var boomPhase: Float = 0
    var boomTone: Float = 1
    var body: Float = 0
    var bodyPhase: Float = 0
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

    func shot(_ kind: Int) {
        switch kind {
        case 1:
            rigid.impactOccurred(intensity: 0.64)
            rigid.prepare()
        case 2:
            light.impactOccurred(intensity: 0.72)
            light.prepare()
        case 3:
            heavy.impactOccurred(intensity: 0.8)
            heavy.prepare()
        default:
            shotGate += 1
            rigid.impactOccurred(intensity: shotGate % 2 == 0 ? 0.82 : 0.64)
            rigid.prepare()
        }
    }

    func pickup() {
        light.impactOccurred(intensity: 0.7)
        light.prepare()
    }

    func hit() {
        rigid.impactOccurred(intensity: 0.96)
        rigid.prepare()
    }

    func boom(power: Float = 1) {
        heavy.impactOccurred(intensity: min(CGFloat(1), 0.58 + CGFloat(power) * 0.36))
        heavy.prepare()
    }

    func launch() {
        rigid.impactOccurred(intensity: 0.65)
        rigid.prepare()
    }
}
