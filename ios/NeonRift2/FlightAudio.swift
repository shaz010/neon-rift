import AVFoundation
import UIKit

/// b19: one AVAudioEngine, everything converted to 44.1 kHz stereo float at load,
/// every node attached and connected before start, a serial audio queue for all
/// node calls, restart on interruption / route / configuration change / media
/// reset, and an AVAudioPlayer fallback for the sample clips if the engine fails.
final class FlightAudio {
    /// Short status for the hangar badge (debug-safe, no secrets).
    static var status = "audio …"
    static let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!

    private var engine = AVAudioEngine()
    private let box = UnsafeMutablePointer<AudioBox>.allocate(capacity: 1)
    private var started = false
    private var built = false
    private let samples = SamplePool()
    private let beds = EngineBeds()
    private let queue = DispatchQueue(label: "nr2.audio", qos: .userInitiated)
    private var observers: [NSObjectProtocol] = []
    private var lastRestart: CFTimeInterval = 0
    private var engAge: Float = 0
    private var engSwell: Float = 0

    /// b20: call at the start of each flight so the engine opens at full volume again.
    func resetEngineEnvelope() { engAge = 0; engSwell = 0 }

    init() {
        box.initialize(to: AudioBox())
        box.pointee.rate = 44_100
    }

    func startIfNeeded() {
        queue.sync { self.startLocked() }
    }

    /// Called when the app becomes active and before plays when the engine is down.
    func ensureRunning() {
        queue.async { [weak self] in
            guard let self else { return }
            if !self.engine.isRunning { self.restartLocked(reason: "resume") }
        }
    }

    private func startLocked() {
        guard !started else { return }
        AudioSession.engage()
        if !built { buildGraph() }
        engine.prepare()
        do {
            try engine.start()
            started = true
            samples.useEngine(engine)
            beds.start()
            FlightAudio.status = "audio ok"
            NSLog("NR2 audio: engine started, output \(engine.outputNode.outputFormat(forBus: 0))")
        } catch {
            let code = (error as NSError).code
            FlightAudio.status = "audio fb \(code)"
            NSLog("NR2 audio: engine start failed \(code) \(error.localizedDescription); sample fallback on")
            samples.useFallback()
            started = true
        }
        if observers.isEmpty { observe() }
    }

    private func restartLocked(reason: String) {
        let now = CACurrentMediaTime()
        guard now - lastRestart > 0.5 else { return }
        lastRestart = now
        NSLog("NR2 audio: restart (\(reason))")
        AudioSession.engage()
        if engine.isRunning { return }
        engine.prepare()
        do {
            try engine.start()
            samples.useEngine(engine)
            beds.start()
            FlightAudio.status = "audio ok"
        } catch {
            FlightAudio.status = "audio fb \((error as NSError).code)"
            samples.useFallback()
        }
    }

    private func observe() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
            guard let self else { return }
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            if raw == AVAudioSession.InterruptionType.ended.rawValue {
                self.queue.async { self.lastRestart = 0; self.restartLocked(reason: "interruption ended") }
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self else { return }
            self.queue.asyncAfter(deadline: .now() + 0.2) { if !self.engine.isRunning { self.restartLocked(reason: "route") } }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
            guard let self else { return }
            self.queue.async { self.lastRestart = 0; self.restartLocked(reason: "configuration") }
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] _ in
            self?.ensureRunning()
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self else { return }
            self.queue.async { self.rebuildLocked() }
        })
    }

    /// Media services reset invalidates every node: build a fresh engine.
    private func rebuildLocked() {
        engine.stop()
        engine = AVAudioEngine()
        built = false
        started = false
        samples.reset()
        beds.reset()
        for o in observers { NotificationCenter.default.removeObserver(o) }
        observers.removeAll()
        startLocked()
    }

    private func buildGraph() {
        built = true
        let format = FlightAudio.format
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
            // b18: EngineVoice targets (written by the game thread, smoothed per sample).
            let tThr = local.engThrottle
            let tSpd = local.engSpeed
            let tTurn = local.engTurn
            let tBoost = local.engBoost
            let tDmg = local.engDamage
            let tGain = local.engGain
            let smooth = min(1, dt / 0.09)
            var endE = local.eng
            // b19: one synth pass per render, written to every channel buffer
            // (b18 re-ran the whole synth once per deinterleaved buffer).
            let thumpK: Float = exp(-dt / 0.09)
            let zapK: Float = exp(-dt / 0.032)
            guard buffers.count > 0, let d0 = buffers[0].mData else { return noErr }
            let out0 = d0.assumingMemoryBound(to: Float.self)
            let out1: UnsafeMutablePointer<Float>? = buffers.count > 1 ? buffers[1].mData?.assumingMemoryBound(to: Float.self) : nil
            do {
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
                var e = local.eng
                let channelCount = max(1, buffers.count)
                for i in 0..<frames {
                    phase += dt * (52 + thrust * 70)
                    if phase > 8 { phase -= 8 }
                    musicPhase += dt * (1.15 + music * 1.7)
                    var seed = nstate &* 747796405 &+ 2891336453
                    nstate = seed
                    seed = (seed >> ((seed >> 28) &+ 4)) ^ seed &* 277803737
                    let noise = Float(Int32(bitPattern: seed)) / Float(Int32.max)
                    _ = thrust
                    // b18 EngineVoice: three detuned saws + sub, two-pole low-pass that
                    // follows throttle and boost, speed rumble, turn bend, damage sputter,
                    // and slow random drift. Every control is smoothed, so no clicks.
                    e.thr += (tThr - e.thr) * smooth
                    e.spd += (tSpd - e.spd) * smooth
                    e.turn += (tTurn - e.turn) * smooth
                    e.boost += (tBoost - e.boost) * smooth * 0.6
                    e.dmg += (tDmg - e.dmg) * smooth * 0.2
                    e.dn += (noise - e.dn) * min(1, dt * 2.2)
                    e.lfo += dt
                    if e.lfo > 1000 { e.lfo -= 1000 }
                    let drift: Float = sin(e.lfo * 0.446) * 0.55 + sin(e.lfo * 1.087 + 1.3) * 0.3 + e.dn * 9
                    let base: Float = (44 + 62 * e.thr + 26 * e.boost + 10 * e.spd)
                        * (1 + 0.05 * abs(e.turn) + 0.012 * drift)
                    e.p1 += dt * base * 1.0041
                    e.p2 += dt * base * 0.9962
                    e.p3 += dt * base * 2.003
                    e.ps += dt * base * 0.5
                    if e.p1 > 1 { e.p1 -= 1 }
                    if e.p2 > 1 { e.p2 -= 1 }
                    if e.p3 > 1 { e.p3 -= 1 }
                    if e.ps > 1 { e.ps -= 1 }
                    let osc: Float = ((2 * e.p1 - 1) + (2 * e.p2 - 1)) * 0.36 + (2 * e.p3 - 1) * 0.16
                        + sin(e.ps * 2 * .pi) * 0.42
                    let cutoff: Float = 160 + 820 * e.thr + 1500 * e.boost + 260 * e.spd + 90 * drift
                    let g: Float = 1 - exp(-2 * .pi * max(60, cutoff) * dt)
                    e.lp1 += g * (osc - e.lp1)
                    e.lp2 += g * (e.lp1 - e.lp2)
                    let gn: Float = 1 - exp(-2 * .pi * (110 + 380 * e.spd + 500 * e.boost) * dt)
                    e.nl += gn * (noise - e.nl)
                    e.sp += dt * (9 + 5 * e.dn)
                    if e.sp > 1000 { e.sp -= 1000 }
                    let sputter: Float = 1 - e.dmg * 0.55 * max(0, sin(e.sp * 2 * .pi)) * (0.6 + 0.4 * sin(e.sp * 0.37))
                    e.gain += (tGain - e.gain) * smooth * 0.25
                    let voice: Float = e.gain * (e.lp2 * (0.06 + 0.07 * e.thr + 0.04 * e.boost)
                        + e.nl * (0.03 + 0.12 * e.spd + 0.06 * e.boost)) * sputter
                    let pan: Float = max(-0.8, min(0.8, e.turn * 0.6))
                    let sideL: Float = channelCount < 2 ? 1 : sqrt(1 - pan)
                    let sideR: Float = channelCount < 2 ? 1 : sqrt(1 + pan)
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
                    let bed = sin(musicPhase * 2 * .pi * (92 + music * 70)) * pulse * (0.012 + music * 0.05) * 0.65
                    lockPhase += dt * (7 + lock * 8)
                    var gate: Float = 0
                    if sin(lockPhase * 2 * .pi) > 0.45 { gate = 1 }
                    let seeker = gate * sin(lockPhase * 16 * .pi) * lock * 0.055
                    let common = (crack + rumble + hit + rise + bell + tow + bed + seeker) * 0.9
                    var l = common + voice * sideL * 0.9
                    var r = common + voice * sideR * 0.9
                    if !l.isFinite { l = 0 }
                    if !r.isFinite { r = 0 }
                    l = max(-1, min(1, l))
                    r = max(-1, min(1, r))
                    if let out1 {
                        out0[i] = l
                        out1[i] = r
                    } else {
                        out0[i] = (l + r) * 0.5
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
                endE = e
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
            state.pointee.eng = endE
            return noErr
        }
        engine.attach(source)
        engine.connect(source, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.9
        samples.attach(to: engine)
        beds.attach(to: engine)
    }

    /// All sample plays go through the serial audio queue; a failed play restarts the engine.
    private func play(_ clip: SamplePool.Clip, volume: Float) {
        guard started else { return }
        queue.async { [weak self] in
            guard let self else { return }
            if !self.samples.play(clip, volume: volume) {
                self.restartLocked(reason: "play while stopped")
                self.samples.play(clip, volume: volume)
            }
        }
    }

    func setThrust(_ value: Float) { box.pointee.thrust = min(1, max(0, value)) }
    func setLaunch(_ value: Float) { box.pointee.launch = min(1, max(box.pointee.launch, value)) }
    func setMusic(_ value: Float) { box.pointee.music = min(1, max(0, value)) }
    func setBeam(_ value: Float) { box.pointee.beam = min(1, max(0, value)) }
    func setLock(_ value: Float) { box.pointee.lock = min(1, max(0, value)) }
    /// b17: Logic "Sharp Laser Boomer", trimmed to 0.32 s, peak -4 dBFS.
    func shot() { play(.shot, volume: 0.42) }
    /// b17: Logic "Strong Connections Impact 02", trimmed to 1.6 s, peak -4 dBFS.
    func explosion(volume: Float = 0.62) { play(.kill, volume: volume) }
    /// b17: Logic "Locking Target FX", trimmed, peak -4 dBFS.
    func lockOn() { play(.lock, volume: 0.34) }
    /// b18: EngineVoice controls. All 0...1 except turn (-1...1). Also drives the Logic beds.
    func setEngine(throttle: Float, speed: Float, turn: Float, boost: Float, damage: Float, dt: Float) {
        box.pointee.engThrottle = min(1, max(0, throttle))
        box.pointee.engSpeed = min(1, max(0, speed))
        box.pointee.engTurn = min(1, max(-1, turn))
        box.pointee.engBoost = min(1, max(0, boost))
        box.pointee.engDamage = min(1, max(0, damage))
        // b20: engine envelope. Full volume for the first ~4 s of a flight, then it
        // trims to ~22%. Boost or a hard turn swells it back up briefly, then it settles.
        engAge += dt
        let base: Float = engAge < 4 ? 1 : max(0.22, 1 - (engAge - 4) / 2.5 * 0.78)
        if boost > 0.3 || abs(turn) > 0.75 { engSwell = min(1, engSwell + dt * 4) } else { engSwell = max(0, engSwell - dt / 1.4) }
        let gain = base + (1 - base) * engSwell * 0.85
        box.pointee.engGain = gain
        guard started else { return }
        queue.async { [weak self] in self?.beds.update(throttle: throttle, speed: speed, boost: boost, dt: dt, gain: gain) }
    }
    /// b18: rising hit tick. Each consecutive hit on the same target steps up in pitch.
    func hitTick(streak: Int) {
        let clips: [SamplePool.Clip] = [.tick0, .tick1, .tick2, .tick3]
        play(clips[min(3, max(0, streak / 2))], volume: 0.2)
    }
    func warn() { play(.warn, volume: 0.26) }
    func secondaryBoom(volume: Float = 0.36) { play(.boom2, volume: volume) }
    func bigBoom(volume: Float = 0.62) { play(.bigboom, volume: volume) }
    func boostWhoosh() { play(.boost, volume: 0.3) }
    func dive() { play(.dive, volume: 0.24) }
    func rollSweep() { play(.roll, volume: 0.22) }
    func overdrive() { play(.overdrive, volume: 0.36) }
    func crate() { play(.crate, volume: 0.34) }
    func titleHit() { box.pointee.sting = 1 }
    func chime() { box.pointee.chime = 1 }

    deinit {
        for o in observers { NotificationCenter.default.removeObserver(o) }
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
    var engThrottle: Float = 0
    var engSpeed: Float = 0
    var engTurn: Float = 0
    var engBoost: Float = 0
    var engDamage: Float = 0
    var engGain: Float = 1
    var eng = EngineState()
}

/// b18: per-sample EngineVoice state.
private struct EngineState {
    var gain: Float = 1
    var thr: Float = 0
    var spd: Float = 0
    var turn: Float = 0
    var boost: Float = 0
    var dmg: Float = 0
    var dn: Float = 0
    var lfo: Float = 0
    var p1: Float = 0
    var p2: Float = 0.37
    var p3: Float = 0.71
    var ps: Float = 0
    var lp1: Float = 0
    var lp2: Float = 0
    var nl: Float = 0
    var sp: Float = 0
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

    /// b17: short punchy kill thump, a hard hit then a light tail tap.
    func kill() {
        heavy.impactOccurred(intensity: 1)
        heavy.prepare()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.07) { [weak self] in
            self?.rigid.impactOccurred(intensity: 0.55)
            self?.rigid.prepare()
        }
    }

    func launch() {
        rigid.impactOccurred(intensity: 0.65)
        rigid.prepare()
    }
}

/// Preloaded PCM buffers played through a round-robin pool of player nodes on
/// the flight engine, so shots overlap with no file I/O at fire time.
private final class SamplePool {
    enum Clip: CaseIterable {
        case shot, kill, lock
        case tick0, tick1, tick2, tick3, warn, boom2, bigboom, boost, dive, roll, overdrive, crate
        var file: String {
            switch self {
            case .shot: return "nr2-shot"
            case .kill: return "nr2-kill"
            case .lock: return "nr2-lock"
            case .tick0: return "nr2-tick0"
            case .tick1: return "nr2-tick1"
            case .tick2: return "nr2-tick2"
            case .tick3: return "nr2-tick3"
            case .warn: return "nr2-warn"
            case .boom2: return "nr2-boom2"
            case .bigboom: return "nr2-bigboom"
            case .boost: return "nr2-boost"
            case .dive: return "nr2-dive"
            case .roll: return "nr2-roll"
            case .overdrive: return "nr2-overdrive"
            case .crate: return "nr2-crate"
            }
        }
        var voices: Int {
            switch self {
            case .shot: return 6
            case .kill: return 4
            case .lock: return 2
            case .tick0, .tick1, .tick2, .tick3: return 2
            case .boom2: return 4
            case .bigboom: return 2
            default: return 1
            }
        }
    }

    private var buffers: [Clip: AVAudioPCMBuffer] = [:]
    private var players: [Clip: [AVAudioPlayerNode]] = [:]
    private var next: [Clip: Int] = [:]
    private weak var engine: AVAudioEngine?
    private var fallback = false
    private var fbPlayers: [Clip: [AVAudioPlayer]] = [:]

    init() {
        for clip in Clip.allCases {
            if let buffer = loadStereo(clip.file) { buffers[clip] = buffer } else { NSLog("NR2 sample missing: \(clip.file)") }
        }
    }

    func attach(to engine: AVAudioEngine) {
        self.engine = engine
        for clip in Clip.allCases where buffers[clip] != nil {
            var list: [AVAudioPlayerNode] = []
            for _ in 0..<clip.voices {
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: FlightAudio.format)
                list.append(node)
            }
            players[clip] = list
            next[clip] = 0
        }
    }

    func useEngine(_ engine: AVAudioEngine) { self.engine = engine; fallback = false }

    func reset() { players.removeAll(); next.removeAll(); engine = nil }

    /// Engine failed: file-based AVAudioPlayers, independent of the graph.
    func useFallback() {
        fallback = true
        guard fbPlayers.isEmpty else { return }
        for clip in Clip.allCases {
            guard let url = Bundle.main.url(forResource: clip.file, withExtension: "wav") else { continue }
            var list: [AVAudioPlayer] = []
            for _ in 0..<max(1, min(3, clip.voices)) {
                if let p = try? AVAudioPlayer(contentsOf: url) { p.prepareToPlay(); list.append(p) }
            }
            fbPlayers[clip] = list
            if next[clip] == nil { next[clip] = 0 }
        }
    }

    /// Returns false if the engine is down so the caller can restart it.
    @discardableResult
    func play(_ clip: Clip, volume: Float) -> Bool {
        if !fallback, let engine, engine.isRunning, let buffer = buffers[clip], let list = players[clip], !list.isEmpty {
            let index = next[clip] ?? 0
            next[clip] = (index + 1) % list.count
            let node = list[index]
            node.stop()
            node.volume = volume
            node.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
            node.play()
            return true
        }
        if let list = fbPlayers[clip], !list.isEmpty {
            let index = (next[clip] ?? 0) % list.count
            next[clip] = (index + 1) % list.count
            let p = list[index]
            p.currentTime = 0
            p.volume = volume
            p.play()
            return fallback
        }
        return false
    }
}

/// Reads a WAV and converts it to FlightAudio.format (44.1 kHz stereo float).
private func loadStereo(_ name: String) -> AVAudioPCMBuffer? {
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
          let file = try? AVAudioFile(forReading: url),
          let src = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
          (try? file.read(into: src)) != nil else { return nil }
    let dstFormat = FlightAudio.format
    if src.format == dstFormat { return src }
    guard let conv = AVAudioConverter(from: src.format, to: dstFormat) else { return nil }
    if src.format.channelCount == 1 { conv.channelMap = [0, 0] }
    let ratio = dstFormat.sampleRate / src.format.sampleRate
    let cap = AVAudioFrameCount(Double(src.frameLength) * ratio + 1024)
    guard let dst = AVAudioPCMBuffer(pcmFormat: dstFormat, frameCapacity: cap) else { return nil }
    var fed = false
    var err: NSError?
    let status = conv.convert(to: dst, error: &err) { _, out in
        if fed { out.pointee = .endOfStream; return nil }
        fed = true
        out.pointee = .haveData
        return src
    }
    if status == .error || dst.frameLength == 0 { NSLog("NR2 convert failed \(name)"); return nil }
    return dst
}

/// Looped Logic beds under the EngineVoice. Two players per bed crossfade to a
/// fresh random offset every few seconds. b19: no varispeed units (fewer AUs),
/// all buffers 44.1k stereo, all calls on FlightAudio's serial audio queue.
private final class EngineBeds {
    private struct Bed {
        let file: String
        let maxVolume: Float
        var buffer: AVAudioPCMBuffer?
        var players: [AVAudioPlayerNode] = []
        var gains: [Float] = [0, 0]
        var active = 0
        var clock: Float = 0
        var nextSwap: Float = 10
    }
    private var beds: [Bed] = [
        Bed(file: "nr2-bedA", maxVolume: 0.1),
        Bed(file: "nr2-bedB", maxVolume: 0.07),
        Bed(file: "nr2-bedC", maxVolume: 0.05),
    ]
    private var level: [Float] = [0, 0, 0]
    private var running = false

    init() {
        for i in beds.indices {
            beds[i].buffer = loadStereo(beds[i].file)
            if beds[i].buffer == nil { NSLog("NR2 bed missing: \(beds[i].file)") }
        }
    }

    func attach(to engine: AVAudioEngine) {
        for i in beds.indices where beds[i].buffer != nil {
            for _ in 0..<2 {
                let player = AVAudioPlayerNode()
                engine.attach(player)
                engine.connect(player, to: engine.mainMixerNode, format: FlightAudio.format)
                player.volume = 0
                beds[i].players.append(player)
            }
            beds[i].nextSwap = Float.random(in: 8...14)
        }
    }

    func reset() {
        for i in beds.indices { beds[i].players.removeAll(); beds[i].gains = [0, 0]; beds[i].active = 0 }
        running = false
    }

    /// (Re)starts the active slot; safe to call after an engine restart.
    func start() {
        for i in beds.indices where beds[i].players.count == 2 {
            cue(i, slot: beds[i].active)
            beds[i].gains[beds[i].active] = 1
            beds[i].gains[1 - beds[i].active] = 0
        }
        running = true
    }

    private func cue(_ i: Int, slot: Int) {
        guard let buffer = beds[i].buffer, let engine = beds[i].players[slot].engine, engine.isRunning else { return }
        let player = beds[i].players[slot]
        player.stop()
        let total = Int(buffer.frameLength)
        let start = Int.random(in: 0..<max(1, total - 1))
        let count = total - start
        if count > 64, let tail = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: AVAudioFrameCount(count)),
           let src = buffer.floatChannelData, let dst = tail.floatChannelData {
            tail.frameLength = AVAudioFrameCount(count)
            for c in 0..<Int(buffer.format.channelCount) {
                dst[c].update(from: src[c].advanced(by: start), count: count)
            }
            player.scheduleBuffer(tail, at: nil, options: [], completionHandler: nil)
        }
        player.scheduleBuffer(buffer, at: nil, options: [.loops], completionHandler: nil)
        player.volume = 0
        player.play()
    }

    func update(throttle: Float, speed: Float, boost: Float, dt: Float, gain: Float) {
        guard running else { return }
        let t = max(0, min(1, throttle))
        let v = max(0, min(1, speed))
        let b = max(0, min(1, boost))
        let want: [Float] = [0.35 + 0.65 * t, 0.55 + 0.45 * (1 - t) * (1 - v * 0.5), 0.15 + 0.5 * v + 0.6 * b]
        let k = min(1, dt * 2.5)
        for i in beds.indices where beds[i].players.count == 2 {
            level[i] += (min(1, want[i]) - level[i]) * k
            beds[i].clock += dt
            if beds[i].clock > beds[i].nextSwap {
                beds[i].clock = 0
                beds[i].nextSwap = Float.random(in: 9...16)
                let idle = 1 - beds[i].active
                cue(i, slot: idle)
                beds[i].active = idle
            }
            for slot in 0..<2 {
                let target: Float = slot == beds[i].active ? 1 : 0
                beds[i].gains[slot] += (target - beds[i].gains[slot]) * min(1, dt / 2.2)
                beds[i].players[slot].volume = gain * beds[i].maxVolume * level[i] * sqrt(max(0, beds[i].gains[slot]))
            }
        }
    }
}
