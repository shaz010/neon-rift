import AVFoundation

/// Playback-category bed plus shot and explosion voices. Silent-switch safe
/// because the session is `.playback` before the engine starts.
final class FlightAudio {
    private let engine = AVAudioEngine()
    private let box = UnsafeMutablePointer<AudioBox>.allocate(capacity: 1)
    private var started = false
    private let samples = SamplePool()
    private let beds = EngineBeds()

    init() {
        box.initialize(to: AudioBox())
    }

    func startIfNeeded() {
        guard !started else { return }
        let rate: Double = 48_000
        try! engine.enableManualRenderingMode(.offline, format: AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!, maximumFrameCount: 1024)
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
            // b18: EngineVoice targets (written by the game thread, smoothed per sample).
            let tThr = local.engThrottle
            let tSpd = local.engSpeed
            let tTurn = local.engTurn
            let tBoost = local.engBoost
            let tDmg = local.engDamage
            let smooth = min(1, dt / 0.09)
            var endE = local.eng
            for (bufferIndex, buffer) in buffers.enumerated() {
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
                    let voice: Float = (e.lp2 * (0.06 + 0.07 * e.thr + 0.04 * e.boost)
                        + e.nl * (0.03 + 0.12 * e.spd + 0.06 * e.boost)) * sputter
                    let pan: Float = max(-0.8, min(0.8, e.turn * 0.6))
                    let side: Float = channelCount < 2 ? 1 : (bufferIndex == 0 ? sqrt(1 - pan) : sqrt(1 + pan))
                    let hum = voice * side
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
        engine.prepare()
        do {
            try engine.start()
            started = true
            beds.start()
        } catch {
            NSLog("Neon Rift 2 audio engine: \(error.localizedDescription)")
        }
    }

    func setThrust(_ value: Float) { box.pointee.thrust = min(1, max(0, value)) }
    func setLaunch(_ value: Float) { box.pointee.launch = min(1, max(box.pointee.launch, value)) }
    func setMusic(_ value: Float) { box.pointee.music = min(1, max(0, value)) }
    func setBeam(_ value: Float) { box.pointee.beam = min(1, max(0, value)) }
    func setLock(_ value: Float) { box.pointee.lock = min(1, max(0, value)) }
    /// b17: Logic "Sharp Laser Boomer", trimmed to 0.32 s, peak -4 dBFS.
    func shot() { samples.play(.shot, volume: 0.42) }
    /// b17: Logic "Strong Connections Impact 02", trimmed to 1.6 s, peak -4 dBFS.
    func explosion(volume: Float = 0.62) { samples.play(.kill, volume: volume) }
    /// b17: Logic "Locking Target FX", trimmed, peak -4 dBFS.
    func lockOn() { samples.play(.lock, volume: 0.34) }
    /// b18: EngineVoice controls. All 0...1 except turn (-1...1). Also drives the Logic beds.
    func setEngine(throttle: Float, speed: Float, turn: Float, boost: Float, damage: Float, dt: Float) {
        box.pointee.engThrottle = min(1, max(0, throttle))
        box.pointee.engSpeed = min(1, max(0, speed))
        box.pointee.engTurn = min(1, max(-1, turn))
        box.pointee.engBoost = min(1, max(0, boost))
        box.pointee.engDamage = min(1, max(0, damage))
        guard started else { return }
        beds.update(throttle: throttle, speed: speed, boost: boost, dt: dt)
    }
    /// b18: rising hit tick. Each consecutive hit on the same target steps up in pitch.
    func hitTick(streak: Int) {
        let clips: [SamplePool.Clip] = [.tick0, .tick1, .tick2, .tick3]
        samples.play(clips[min(3, max(0, streak / 2))], volume: 0.2)
    }
    func warn() { samples.play(.warn, volume: 0.26) }
    func secondaryBoom(volume: Float = 0.36) { samples.play(.boom2, volume: volume) }
    func bigBoom(volume: Float = 0.62) { samples.play(.bigboom, volume: volume) }
    func boostWhoosh() { samples.play(.boost, volume: 0.3) }
    func dive() { samples.play(.dive, volume: 0.24) }
    func rollSweep() { samples.play(.roll, volume: 0.22) }
    func overdrive() { samples.play(.overdrive, volume: 0.36) }
    func crate() { samples.play(.crate, volume: 0.34) }
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
    var engThrottle: Float = 0
    var engSpeed: Float = 0
    var engTurn: Float = 0
    var engBoost: Float = 0
    var engDamage: Float = 0
    var eng = EngineState()
}

/// b18: per-sample EngineVoice state.
private struct EngineState {
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

    init() {
        for clip in Clip.allCases {
            guard let url = Bundle.main.url(forResource: clip.file, withExtension: "wav"),
                  let file = try? AVAudioFile(forReading: url),
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
                NSLog("NR2 sample missing: \(clip.file)")
                continue
            }
            do { try file.read(into: buffer) } catch { continue }
            buffers[clip] = buffer
        }
    }

    func attach(to engine: AVAudioEngine) {
        self.engine = engine
        for clip in Clip.allCases {
            guard let buffer = buffers[clip] else { continue }
            var list: [AVAudioPlayerNode] = []
            for _ in 0..<clip.voices {
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: buffer.format)
                list.append(node)
            }
            players[clip] = list
            next[clip] = 0
        }
    }

    func play(_ clip: Clip, volume: Float) {
        guard let engine, engine.isRunning, let buffer = buffers[clip], let list = players[clip], !list.isEmpty else { return }
        let index = next[clip] ?? 0
        next[clip] = (index + 1) % list.count
        let node = list[index]
        node.stop()
        node.volume = volume
        node.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        node.play()
    }
}

/// b18: looped Logic beds under the EngineVoice. Each bed has two players so it
/// can crossfade to a fresh random offset every few seconds; a varispeed per
/// player follows speed. Volumes move a little each frame, so there are no clicks.
private final class EngineBeds {
    private struct Bed {
        let file: String
        let maxVolume: Float
        var buffer: AVAudioPCMBuffer?
        var players: [AVAudioPlayerNode] = []
        var speeds: [AVAudioUnitVarispeed] = []
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
            guard let url = Bundle.main.url(forResource: beds[i].file, withExtension: "wav"),
                  let file = try? AVAudioFile(forReading: url),
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
                NSLog("NR2 bed missing: \(beds[i].file)")
                continue
            }
            do { try file.read(into: buffer) } catch { continue }
            beds[i].buffer = buffer
        }
    }

    func attach(to engine: AVAudioEngine) {
        for i in beds.indices {
            guard let buffer = beds[i].buffer else { continue }
            for _ in 0..<2 {
                let player = AVAudioPlayerNode()
                let speed = AVAudioUnitVarispeed()
                engine.attach(player)
                engine.attach(speed)
                engine.connect(player, to: speed, format: buffer.format)
                engine.connect(speed, to: engine.mainMixerNode, format: buffer.format)
                player.volume = 0
                beds[i].players.append(player)
                beds[i].speeds.append(speed)
            }
            beds[i].nextSwap = Float.random(in: 8...14)
        }
    }

    func start() {
        for i in beds.indices where beds[i].players.count == 2 {
            cue(i, slot: 0)
            beds[i].gains = [1, 0]
        }
        running = true
    }

    /// Starts `slot` looping from a random point in the bed.
    private func cue(_ i: Int, slot: Int) {
        guard let buffer = beds[i].buffer else { return }
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

    func update(throttle: Float, speed: Float, boost: Float, dt: Float) {
        guard running else { return }
        let t = max(0, min(1, throttle))
        let v = max(0, min(1, speed))
        let b = max(0, min(1, boost))
        // A: the main engine riser bed, B: deep synth layers at cruise, C: pulsing noise at speed and boost.
        let want: [Float] = [0.35 + 0.65 * t, 0.55 + 0.45 * (1 - t) * (1 - v * 0.5), 0.15 + 0.5 * v + 0.6 * b]
        let rates: [Float] = [0.86 + 0.3 * v + 0.12 * b, 0.94 + 0.1 * t, 0.9 + 0.35 * v]
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
                let g = beds[i].gains[slot]
                beds[i].players[slot].volume = beds[i].maxVolume * level[i] * sqrt(max(0, g))
                beds[i].speeds[slot].rate = rates[i]
            }
        }
    }
}

extension FlightAudio {
    func probe() {
        startIfNeeded()
        print("started", started, engine.isRunning)
        let fmt = engine.manualRenderingFormat
        let out = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: 1024)!
        var peak: Float = 0; var nan = 0
        for k in 0..<400 {
            let t = Float(k) / 47
            setEngine(throttle: 0.8, speed: 0.6, turn: sin(t), boost: k > 200 ? 1 : 0, damage: 0.3, dt: 1/47)
            if k % 20 == 0 { shot() }
            if k == 100 { bigBoom() }
            _ = try! engine.renderOffline(1024, to: out)
            for c in 0..<Int(fmt.channelCount) { let p = out.floatChannelData![c]; for i in 0..<Int(out.frameLength) { if p[i].isNaN { nan += 1 } else { peak = max(peak, abs(p[i])) } } }
            if k % 50 == 0 { print("block", k, "peak", peak, "nan", nan); peak = 0 }
        }
    }
}
