import Darwin
import SceneKit
import UIKit
import simd

enum FlightPhase: String {
    case cinema, combat, warden, results
}

struct RenderProfile {
    var high: Bool
    var bloom: CGFloat
    var dof: Bool
    var debris: Int
    var sparks: Int
    var grain: Bool
    var msaa: SCNAntialiasingMode

    static func detect(showcase: Bool) -> RenderProfile {
        if showcase { return .cinematic }
        let hot = ProcessInfo.processInfo.thermalState == .serious
            || ProcessInfo.processInfo.thermalState == .critical
        if hot || !modernPhone {
            return .reduced
        }
        return .cinematic
    }

    static var cinematic: RenderProfile {
        let dof: Bool
        #if targetEnvironment(simulator)
        dof = false
        #else
        dof = true
        #endif
        return RenderProfile(high: true, bloom: 0.85, dof: dof, debris: 10, sparks: 18, grain: true, msaa: .multisampling2X)
    }

    static var reduced: RenderProfile {
        RenderProfile(high: false, bloom: 0.28, dof: false, debris: 4, sparks: 8, grain: false, msaa: .none)
    }

    /// iPhone 12 (iPhone13,x) and newer, plus every iPad. Simulator stays cinematic.
    private static var modernPhone: Bool {
        var system = utsname()
        uname(&system)
        let name = withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 256) { String(cString: $0) }
        }
        if name == "arm64" || name == "x86_64" || name.hasPrefix("arm64") { return true }
        if name.hasPrefix("iPad") { return true }
        guard name.hasPrefix("iPhone") else { return false }
        let digits = name.dropFirst("iPhone".count).prefix { $0.isNumber }
        return (Int(digits) ?? 0) >= 13
    }
}

struct HudSnapshot {
    var model: HudModel
    var grain: Bool
    var reduced: Bool
}

struct HudModel {
    var phase: FlightPhase = .cinema
    var clock = "14:32:07"
    var nav = "NAV-04"
    var speed = "SPD 0.00c"
    var weapon = 100
    var shield = 100
    var hull = 100
    var heading: Float = 0
    var lockWorld: simd_float3?
    var pickups: [simd_float3] = []
    var popups: [(simd_float3, String, Float)] = []
    var sunWorld = simd_float3.zero
    var titleAlpha: Float = 0
    var promptAlpha: Float = 0
    var letterbox: Float = 1
    var flash: Float = 0
    var stick = CGPoint.zero
    var firing = false
    var showResults = false
    var resultsBody = ""
    var credits = ""
    var creditScroll: Float = 0
    var kills = 0
    var score = 0
    var objective = "DRAG ANYWHERE ON THE LEFT TO FLY"
    var callout = ""
    var calloutAlpha: Float = 0
    var contacts: [HudContact] = []
    var blips: [HudBlip] = []
    var bounty = 0
    var rank = "ROOKIE"
    var boost: Float = 0
    var towing = false
    var beamReady = false
    var cockpit = false
    var lockTitle = ""
    var lockHealth: Float = 0
    var lockMissile = false
    var gems: [(simd_float3, String)] = []
    var guideTitle = ""
    var guideBearing: Float = 0
    var guideDistance: Float = 0
    var guideWorld: simd_float3?
    // b18
    var lockID = -1
    var lockDistance: Float = 0
    var lockChosen = false
    var lockAge: Float = 0
    var lockCritical = false
    var heat: Float = 0
    var overheated = false
    var overdrive: Float = 0
    var hintWorld: simd_float3?
    var bossTitle = ""
    var bossHealth: Float = 0
    var viewName = "CHASE"
    var trickShot: Float = 0
}

struct HudContact {
    var world: simd_float3
    var kind: Int
    var distance: Float
    var bearing: Float
    var id: Int = -1
    var health: Float = 1
}

struct HudBlip {
    var x: Float
    var y: Float
    var kind: Int
    var id: Int = -1
}

/// One short Newtonian test flight. Translation is integrated explicitly
/// (vacuum plus a flight-assist damper). Attitude is rate-limited so the
/// ship cannot tumble. Debris from a kill is a SceneKit rigid body.
final class FlightWorld: NSObject, SCNSceneRendererDelegate {
    let scene = SCNScene()
    let cameraNode = SCNNode()
    let camera = SCNCamera()
    let showcase: Bool
    private let audio: FlightAudio
    private let haptics: FlightHaptics
    private var profile: RenderProfile
    private let art = ArtSet.shared

    private(set) var hud = HudModel()
    var inputStick = CGPoint.zero
    /// Right-thumb aim. x is yaw, y is pitch. Holding the finger also fires.
    var inputAim = CGPoint.zero
    var inputFire = false
    var inputBoost = false
    /// Viewport width divided by height. Landscape tightens the vertical field of view.
    var viewportAspect: Float = 9.0 / 19.5
    var onFrame: ((HudSnapshot) -> Void)?
    private let frameLock = NSLock()
    private var pendingSnapshot: HudSnapshot?
    private var frameQueued = false

    private var phase: FlightPhase = .cinema
    private var phaseTime: Float = 0
    private var missionTime: Float = 0
    private var lastTime: TimeInterval = 0
    private var slowmo: Float = 0

    private let mass: Float = 8500
    private let maxThrust: Float = 8500 * 42
    private var position = simd_float3(0, 3.4, 100)
    private var velocity = simd_float3.zero
    private var yaw: Float = 0
    private var pitch: Float = 0
    private var roll: Float = 0

    private var shield: Float = 100
    private var shieldCap: Float = 100
    private var hull: Float = 100
    private var weapon: Float = 100
    private var score = 0
    private var kills = 0
    private var hurt: Float = 0
    private var regenWait: Float = 0
    private var died = false
    private var deathClock: Float = 0
    private var fireClock: Float = 0
    private var titleStung = false
    private var launchBuzzed = false

    private let player = SCNNode()
    private var hangar = SCNNode()
    private var rift = SCNNode()
    private var cockpit = SCNNode()
    private var cockpitBuilt = false
    private var speedText: SCNText?
    private var targetText: SCNText?
    private var shieldFill: SCNNode?
    private var hullFill: SCNNode?
    private var weaponFill: SCNNode?
    private var targetFill: SCNNode?
    private var radarDisc: SCNNode?
    private var radarBlips: [SCNNode] = []
    private var lastSpeedLine = ""
    private var lastTargetLine = ""
    private let flashLight = SCNNode()
    private let engineLight = SCNNode()
    private var dreadnought: SCNNode?
    private var wardenLight: SCNNode?

    private var enemies: [Enemy] = []
    private var bolts: [Bolt] = []
    private var pickups: [Pickup] = []
    private var debris: [Debris] = []
    private var effects: [Effect] = []
    private var popups: [Popup] = []
    private var spawned = 0
    private let waveTimes: [Float]
    private let waveCount: Int

    private var camPos = simd_float3.zero
    private var camLook = simd_float3.zero
    private var camReady = false
    private var shake: Float = 0
    private var flash: Float = 0
    private var markedHangar = false
    private var markedCombat = false
    private var markedWarden = false
    private var firstKill: Float = -1
    private var boostLeft: Float = 0
    private var spreadLevel = 0  // b17: SPREAD is a damage + fire-rate boost, never a fan.
    private var lockedEnemy: Enemy?
    // b18 state
    private var chosenEnemy: Enemy?
    private var pendingPick: Int?
    private var nextEnemyID = 1
    private var heat: Float = 0
    private var overheated = false
    private var holdTime: Float = 0
    private var overdriveLeft: Float = 0
    private var collectTimes: [Float] = []
    private var hitStop: Float = 0
    private var killChain = 0
    private var killChainLeft: Float = 0
    private var hintEnemy: Enemy?
    private var hintLeft: Float = 0
    private var rocks: [Rock] = []
    private var lockAge: Float = 0
    private var lastHitID = -1
    private var hitStreak = 0
    private var dyings: [Dying] = []
    private var bossActive = false
    private var bossTime: Float = 0
    private var bossDead = false
    private var bossDeadTime: Float = 0
    private var bossOutcome = ""
    private var bossFinale = false
    private var turrets: [Enemy] = []
    private var bossCore: Enemy?
    private var viewMode = UserDefaults.standard.integer(forKey: "nr2.viewMode") % 3
    private var aerialYaw: Float = 0
    private var aerialCenter = simd_float3.zero
    private var aerialSpan: Float = 60
    private var trickShotFlash: Float = 0
    private var trickHinted = UserDefaults.standard.bool(forKey: "nr2.trickHint")
    private var trickCooldown: Float = 0
    private lazy var whiteCore: SCNMaterial = {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = UIColor.white
        m.emission.contents = UIColor.white
        m.blendMode = .add
        m.writesToDepthBuffer = false
        return m
    }()
    private lazy var hotDebris: SCNMaterial = {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = UIColor(red: 1, green: 0.55, blue: 0.18, alpha: 1)
        m.emission.contents = UIColor(red: 1, green: 0.6, blue: 0.2, alpha: 1)
        return m
    }()
    private lazy var shockMat: SCNMaterial = {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = UIColor(red: 0.75, green: 0.92, blue: 1, alpha: 1)
        m.emission.contents = UIColor(red: 0.75, green: 0.92, blue: 1, alpha: 1)
        m.blendMode = .add
        m.writesToDepthBuffer = false
        return m
    }()
    private var missileLevel = 0
    private var missileClock: Float = 0
    private var trick: Trick?
    private var trickAge: Float = 0
    private var trickDir: Float = 1
    private var trickPitch0: Float = 0
    private var trickRoll0: Float = 0
    private var trickCamYaw: Float = 0
    private var faceLeft: Float = 0
    private var bestStreak = 0
    private var loggedSortie = false
    private var hadLock = false
    private var multiplier = 1
    private var bounty = 0
    private var deliveries = 0
    private var streak = 0
    private var streakLeft: Float = 0
    private var rank = "ROOKIE"
    private var callout = ""
    private var calloutLeft: Float = 0
    private var creditScroll: Float = 0
    private var towed: Enemy?
    private var cycled: Enemy?
    private var cockpitOn = false
    private var pendingBooms: [(simd_float3, Float, Float)] = []
    private let dropoff = simd_float3(62, 11, -230)
    private let beamNode = SCNNode()
    private let captureGoal: Int
    private var degraded = false
    private var fpsWindow: Float = 0
    private var fpsFrames = 0
    private var lowStrikes = 0
    private var heatScroll: Float = 0
    private var lastBeat = -1

    var wantsGrain: Bool { profile.grain && !degraded }
    var profileIsReduced: Bool { degraded || !profile.high }

    init(audio: FlightAudio, haptics: FlightHaptics, showcase: Bool, profile: RenderProfile) {
        self.audio = audio
        self.haptics = haptics
        self.showcase = showcase
        self.profile = profile
        if showcase {
            waveTimes = [0.4, 1.1, 2.4]
            waveCount = 3
            captureGoal = 1
            hull = 240
            shield = 200
        } else {
            waveTimes = [2, 5, 9, 14, 22, 30, 42, 54]
            waveCount = 8
            captureGoal = 3
        }
        super.init()
    }

    func boot() {
        setbuf(stdout, nil)
        audio.startIfNeeded()
        buildScene()
        enter(.cinema)
        deliverFrame()
    }

    func skipCinema() {
        guard phase == .cinema else { return }
        position = simd_float3(0, 6, -24)
        velocity = simd_float3(0, 0, -38)
        yaw = 0
        pitch = 0
        roll = 0
        enter(.combat)
        camReady = false
    }

    func degrade() {
        guard !degraded else { return }
        degraded = true
        profile.dof = false
        profile.bloom = 0.25
        profile.debris = 4
        profile.sparks = 8
        camera.wantsDepthOfField = false
        camera.bloomIntensity = profile.bloom
        logMark("NR2 quality reduced")
    }

    func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        if lastTime == 0 {
            lastTime = time
            deliverFrame()
            return
        }
        var raw = Float(time - lastTime)
        lastTime = time
        if raw < 0 { return }
        if raw > 0.05 { raw = 0.05 }

        if slowmo > 0 {
            slowmo -= raw
            if slowmo < 0 { slowmo = 0 }
        }
        var sim = raw * (slowmo > 0 ? 0.42 : 1)
        if hitStop > 0 {
            hitStop -= raw
            sim = 0
        }
        lockAge += raw

        phaseTime += raw
        missionTime += raw
        watchFPS(raw)
        step(raw: raw, sim: sim)
        publishHud()
        deliverFrame()
    }

    /// SceneKit's display link calls the renderer off the main thread on iPad.
    /// UIKit (alpha, focus, layout) has to run on main, so the HUD is a snapshot.
    private func deliverFrame() {
        let snapshot = HudSnapshot(model: hud, grain: wantsGrain, reduced: profileIsReduced)
        if Thread.isMainThread {
            onFrame?(snapshot)
            return
        }
        frameLock.lock()
        pendingSnapshot = snapshot
        let schedule = !frameQueued
        if schedule { frameQueued = true }
        frameLock.unlock()
        guard schedule else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.frameLock.lock()
            let latest = self.pendingSnapshot
            self.pendingSnapshot = nil
            self.frameQueued = false
            self.frameLock.unlock()
            if let latest {
                self.onFrame?(latest)
            }
        }
    }

    private func step(raw: Float, sim: Float) {
        switch phase {
        case .cinema:
            stepCinema(raw)
        case .combat:
            stepFlight(sim)
            stepCombat(sim)
            if died {
                deathClock += raw
                if deathClock > 1.7 { enter(.results) }
            } else if bossActive {
                stepBoss(sim, raw: raw)
                if bossDead && bossDeadTime > 6.5 {
                    enter(.results)
                } else if !bossDead && bossTime > 150 {
                    bossOutcome = "WARDEN ESCAPED"
                    enter(.results)
                }
            } else if showcase {
                if deliveries >= captureGoal && phaseTime > 3 || phaseTime > 28 { enter(.warden) }
            } else if deliveries >= captureGoal && phaseTime > 3 || phaseTime > 170 {
                startBoss()
            }
        case .warden:
            stepFlight(sim * 0.35)
            stepWarden(raw)
            if phaseTime > 12.5 { enter(.results) }
        case .results:
            creditScroll += raw
        }
        stepBolts(sim)
        stepEffects(sim)
        stepDebris()
        updateCamera(raw)
        updateLights()
        updateMarkers(raw)
    }

    private func stepCinema(_ raw: Float) {
        let spool = smoothstep(1.5, 3.4, phaseTime)
        let launch = smoothstep(3.3, 8.1, phaseTime)
        let eased = 1 - (1 - launch) * (1 - launch)
        let z = mix(100, -16, eased)
        position = simd_float3(sin(phaseTime * 0.35) * 0.4, 3.4 + launch * 2.2, z)
        velocity = simd_float3(0, 0.6 * launch, -42 * launch)
        yaw = 0
        pitch = 0.04 * launch
        roll = sin(phaseTime * 0.8) * 0.03 * launch
        placePlayer()
        audio.setThrust(spool)
        audio.setEngine(throttle: spool * 0.7, speed: launch * 0.4, turn: 0, boost: 0, damage: 0, dt: raw)
        audio.setLaunch(spool * 0.8)
        art.cyanGlow.emission.intensity = CGFloat(0.15 + spool * 1.15)
        if spool > 0.55 && !launchBuzzed {
            launchBuzzed = true
            haptics.launch()
        }
        let title = smoothstep(3.15, 3.9, phaseTime) * (1 - smoothstep(7.5, 8.3, phaseTime))
        hud.titleAlpha = title
        if title > 0.55 && !titleStung {
            titleStung = true
            audio.titleHit()
        }
        if !markedHangar && phaseTime > 4.7 {
            markedHangar = true
            logMark("NR2 mark hangar")
        }
        if phaseTime > 8.5 {
            enter(.combat)
        }
    }

    func requestBoost() {
        inputBoost = true
    }

    func requestLoop(direction: Float = 1) {
        beginTrick(.loop, direction: direction)
    }

    /// b18: tap a bracket or radar blip to choose the target. Main thread.
    func selectTarget(id: Int) {
        frameLock.lock()
        pendingPick = id
        frameLock.unlock()
    }

    func requestRoll(direction: Float) {
        beginTrick(.roll, direction: direction)
    }

    func requestFace() {
        return  // b17: FACE removed; targeting is auto-lock only.
        guard phase == .combat, !died else { return }
        cycled = nearestHostile()
        faceLeft = 0.85
        if let cycled {
            say(cycled.role == .bandit ? "FACE BANDIT" : "FACE BOGEY")
        }
    }

    private func beginTrick(_ kind: Trick, direction: Float) {
        guard phase == .combat, !died, trick == nil, trickCooldown <= 0 else { return }
        trickCooldown = 0.35
        trick = kind
        trickAge = 0
        trickDir = direction >= 0 ? 1 : -1
        trickPitch0 = pitch
        trickRoll0 = roll
        trickCamYaw = yaw
        say(kind == .loop ? (trickDir > 0 ? "LOOP" : "SOMERSAULT") : "BARREL ROLL")
        if kind == .loop { audio.dive() } else { audio.rollSweep() }
        haptics.launch()
    }

    func toggleTractor() {
        if towed != nil {
            towed = nil
            say("BEAM OFF")
            return
        }
        guard let ship = nearestDisabled(maxDistance: 96) else {
            say("NO SHIP IN RANGE")
            return
        }
        towed = ship
        say("BEAM LOCKED")
        haptics.hit()
    }

    func toggleView() {
        guard phase == .combat || phase == .warden else { return }
        // b18: CHASE -> AERIAL -> COCKPIT, remembered between flights.
        viewMode = (viewMode + 1) % 3
        UserDefaults.standard.set(viewMode, forKey: "nr2.viewMode")
        if viewMode == 2 { ensureCockpit() }
        cockpitOn = viewMode == 2
        aerialYaw = yaw
        aerialCenter = position
        say(viewMode == 0 ? "CHASE VIEW" : (viewMode == 1 ? "AERIAL VIEW" : "COCKPIT VIEW"))
        refreshCockpitVisibility()
    }

    /// SCNText tessellation is slow. The showcase never opens the cockpit, so
    /// the panel is built on the first real toggle instead of at launch.
    private func ensureCockpit() {
        guard !cockpitBuilt else { return }
        cockpitBuilt = true
        let built = Meshes.cockpit(art: art)
        speedText = built.childNode(withName: "speedText", recursively: true)?.geometry as? SCNText
        targetText = built.childNode(withName: "targetText", recursively: true)?.geometry as? SCNText
        shieldFill = built.childNode(withName: "shieldFill", recursively: true)
        hullFill = built.childNode(withName: "hullFill", recursively: true)
        weaponFill = built.childNode(withName: "weaponFill", recursively: true)
        targetFill = built.childNode(withName: "targetFill", recursively: true)
        radarDisc = built.childNode(withName: "radar", recursively: true)
        radarBlips = (0..<6).compactMap { built.childNode(withName: "blip\($0)", recursively: true) }
        built.isHidden = true
        cameraNode.addChildNode(built)
        cockpit = built
    }

    private func refreshCockpitVisibility() {
        let show = cockpitOn && (phase == .combat || phase == .warden)
        cockpit.isHidden = !show
        if phase == .combat {
            player.isHidden = show
        }
    }

    /// Called on the main thread from the HUD apply.
    func applyCockpitReadout(speed: String, target: String) {
        guard cockpitOn else { return }
        if speed != lastSpeedLine {
            lastSpeedLine = speed
            speedText?.string = speed
        }
        if target != lastTargetLine {
            lastTargetLine = target
            targetText?.string = target
        }
    }

    func cycleTarget() {
        return  // b17: CYCLE removed; targeting is auto-lock only.
        let list = enemies.filter { $0.alive }
        guard !list.isEmpty else { return }
        if let current = cycled, let index = list.firstIndex(where: { $0 === current }) {
            cycled = list[(index + 1) % list.count]
        } else {
            cycled = list[0]
        }
        let name = cycled?.role == .bandit ? "BANDIT" : "BOGEY"
        say("TARGET \(name)")
    }

    private func stepFlight(_ dt: Float) {
        let auto = showcase && phase == .combat && !died
        var stick = inputStick
        var fire = inputFire
        if auto {
            if let towed {
                let cross = yawError(toward: dropoff)
                stick.x = CGFloat(max(-1, min(1, cross * 2.6)))
                stick.y = 0.95
                fire = false
                _ = towed
            } else if let drifting = nearestDisabled(maxDistance: 400) {
                let cross = yawError(toward: drifting.position)
                stick.x = CGFloat(max(-1, min(1, cross * 2.6)))
                stick.y = simd_distance(drifting.position, position) < 30 ? 0.25 : 0.8
                fire = false
                if simd_distance(drifting.position, position) < 26 { towed = drifting }
            } else if let target = nearestHostile() {
                let cross = yawError(toward: target.position)
                stick.x = CGFloat(max(-1, min(1, cross * 2.6)))
                stick.y = 0.82
                let to = safeNorm(target.position - position)
                fire = simd_dot(forward(), to) > 0.88
            } else {
                stick = CGPoint(x: 0, y: 0.5)
                fire = false
            }
        }
        if phase != .combat || died {
            fire = false
            if phase == .warden { stick = .zero }
        }
        if inputBoost && phase == .combat && !died {
            inputBoost = false
            boostLeft = max(boostLeft, 1.55)
            audio.setLaunch(0.75)
            audio.boostWhoosh()
            haptics.launch()
            say("BOOST")
        }
        hud.stick = stick
        hud.firing = fire

        let mag = hypot(Float(stick.x), Float(stick.y))
        let assisting = mag < 0.08 && hypot(Float(inputAim.x), Float(inputAim.y)) < 0.08
        let x = Float(stick.x)
        let y = Float(stick.y)
        let aimX = auto ? Float(0) : Float(inputAim.x)
        let aimY = auto ? Float(0) : Float(inputAim.y)
        // Left thumb adds a gentle turn. Right thumb is the fine aim. They sum.
        let yawFromLeft: Float = auto ? x : x * 0.4
        var yawCmd = yawFromLeft + aimX * 0.92
        yawCmd = max(-1, min(1, yawCmd))
        let shaped = yawCmd * (0.62 + 0.38 * abs(yawCmd))
        yaw += shaped * 3.25 * dt
        if fire, let aim = aimEnemy(), trick == nil {
            let err = yawError(toward: aim.position)
            if abs(err) < 0.28 {
                yaw += err * min(1, 1.8 * dt)
            }
        }
        if faceLeft > 0, trick == nil {
            faceLeft -= dt
            let target = (cycled?.alive == true && cycled?.disabled == false) ? cycled : nearestHostile()
            if let target {
                let err = yawError(toward: target.position)
                yaw += max(-2.8 * dt, min(2.8 * dt, err))
            }
        }
        if let trick {
            trickAge += dt
            let duration: Float = trick == .loop ? 1.25 : 0.72
            let u = min(1, trickAge / duration)
            if trick == .loop {
                pitch = trickPitch0 + trickDir * u * 2 * .pi
            } else {
                roll = trickRoll0 + trickDir * u * 2 * .pi
            }
            if u >= 1 {
                pitch = trickPitch0
                roll = trickRoll0
                self.trick = nil
            }
        } else {
            var targetPitch = aimY * 0.5
            if faceLeft > 0, let target = (cycled?.alive == true && cycled?.disabled == false) ? cycled : nearestHostile() {
                let climb = target.position.y - position.y
                let dist = max(12, simd_distance(target.position, position))
                targetPitch = max(-0.36, min(0.36, climb / dist))
            }
            pitch += (targetPitch - pitch) * min(1, 14 * dt)
            pitch = max(-0.55, min(0.55, pitch))
            let targetRoll = -yawCmd * 0.62
            roll += (targetRoll - roll) * min(1, 11 * dt)
            roll = max(-0.85, min(0.85, roll))
        }

        if boostLeft > 0 { boostLeft -= dt }
        let boosting = boostLeft > 0
        let fwd = forward()
        let thrustScale: Float = y >= 0 ? y : y * 0.55
        let thrustMul: Float = boosting ? 1.9 : 1
        var force = fwd * (thrustScale * maxThrust * thrustMul)
        if trick != nil { force += fwd * maxThrust * 0.7 }
        if !auto {
            let strafe = safeNorm(simd_cross(fwd, simd_float3(0, 1, 0)))
            force += strafe * x * maxThrust * 0.42
        }
        if towed != nil { force *= 0.72 }
        let forwardSpeed = simd_dot(velocity, fwd)
        let lateral = velocity - fwd * forwardSpeed
        let latK: Float = assisting ? 3.2 : 1.05
        force += -lateral * latK * mass
        if assisting {
            force += -fwd * forwardSpeed * 0.2 * mass
        }
        if trick == nil {
            if position.y < 2 { force.y += (2 - position.y) * mass * 4 }
            if position.y > 28 { force.y -= (position.y - 28) * mass * 3 }
        } else {
            if position.y < -8 { force.y += (-8 - position.y) * mass * 2 }
            if position.y > 46 { force.y -= (position.y - 46) * mass * 2 }
        }
        if abs(position.x) > 280 {
            force.x -= (position.x - copysign(280, position.x)) * mass * 1.4
        }
        if position.z > 50 { force.z -= (position.z - 50) * mass }
        let zFloor: Float = bossActive ? -1300 : -640
        if position.z < zFloor { force.z -= (position.z - zFloor) * mass }

        velocity += force / mass * dt
        let cap: Float = boosting ? 158 : (towed != nil ? 78 : 118)
        let speed = simd_length(velocity)
        if speed > cap { velocity *= cap / speed }
        if !speed.isFinite { velocity = .zero }
        position += velocity * dt
        if phase == .combat && !died { collideWorld() }
        placePlayer()
        if let towed {
            let flat = simd_float3(fwd.x, 0, fwd.z)
            let behind = trick != nil
                ? simd_float3(sin(trickCamYaw), 0, -cos(trickCamYaw))
                : safeNorm(simd_length(flat) > 0.05 ? flat : simd_float3(0, 0, -1))
            let hold = position - behind * 18 + simd_float3(0, -0.2, 0)
            towed.position = hold
            towed.velocity = velocity * 0.9
            towed.node.simdPosition = hold
        }

        let glow = 0.35 + abs(Float(stick.y)) * 0.65
        art.cyanGlow.emission.intensity = CGFloat(0.7 + glow * 0.8 + sin(missionTime * 28) * 0.08)
        heatScroll += dt * (0.4 + glow)
        art.heat.diffuse.contentsTransform = SCNMatrix4MakeTranslation(heatScroll, 0, 0)
        audio.setThrust(assisting ? 0.18 : min(1, abs(Float(stick.y))))
        let throttle: Float = boosting ? 1 : (assisting ? 0.18 : min(1, abs(y)))
        let damage: Float = hull < 60 ? (60 - hull) / 60 : 0
        audio.setEngine(throttle: throttle, speed: simd_length(velocity) / 158, turn: shaped,
                        boost: boosting ? 1 : 0, damage: damage, dt: max(dt, 0.001))

        if abs(Float(stick.x)) > 0.35 {
            puff(at: Float(stick.x) > 0 ? ShipPoints.wingL : ShipPoints.wingR)
        }

        guard phase == .combat, !died else { return }
        // b18: heat gauge. Fire rate ramps up while held; overheat locks until it cools.
        if trickCooldown > 0 && trick == nil { trickCooldown -= dt }
        if overdriveLeft > 0 { overdriveLeft -= dt }
        holdTime = fire ? holdTime + dt : 0
        heat = max(0, heat - (fire ? 0.12 : 0.6) * dt)
        if overheated && heat < 0.55 {
            overheated = false
            say("GUNS COOL")
        }
        weapon = (1 - heat) * 100
        fireClock -= dt
        if fire && !overheated && fireClock <= 0 {
            let ramp: Float = 1 - 0.45 * smoothstep(0, 1.6, holdTime)
            let spreadMul: Float = spreadLevel >= 2 ? 0.7 : (spreadLevel == 1 ? 0.82 : 1)
            fireClock = (showcase ? 0.16 : 0.15) * spreadMul * ramp * (overdriveLeft > 0 ? 0.7 : 1)
            if overdriveLeft <= 0 && !showcase {
                heat += 0.032
                if heat >= 1 {
                    heat = 1
                    overheated = true
                    say("OVERHEAT")
                }
            }
            shootPlayer()
        }
    }

    private func stepCombat(_ dt: Float) {
        if showcase && phaseTime > 9 && deliveries == 0 && nearestDisabled(maxDistance: 800) == nil {
            if let bandit = enemies.first(where: { $0.role == .bandit && $0.alive && !$0.disabled }) {
                disable(bandit)
            }
        }
        if showcase && phaseTime > 18 && deliveries == 0 {
            if towed == nil, let drifting = nearestDisabled(maxDistance: 800) {
                towed = drifting
            }
            if towed != nil {
                position = dropoff + simd_float3(0, 2, 28)
                velocity = simd_float3(0, 0, -20)
                tryDeliver()
            }
        }
        while spawned < waveCount && phaseTime >= waveTimes[spawned] {
            let side: Float = spawned % 2 == 0 ? -1 : 1
            let spread = side * (40 + Float(spawned % 3) * 16)
            let ahead: Float = showcase ? 72 : 150
            let role: ShipRole = spawned % 3 == 2 ? .bogey : .bandit
            spawnEnemy(at: simd_float3(position.x + spread, 8 + Float(spawned % 4), position.z - ahead), role: role)
            spawned += 1
        }
        for enemy in enemies where enemy.alive {
            steer(enemy, dt)
        }
        tryDeliver()
        if hurt > 0 { hurt -= dt }
        if regenWait > 0 {
            regenWait -= dt
        } else if shield < shieldCap && !died {
            shield = min(shieldCap, shield + 18 * dt)
        }
        if streakLeft > 0 {
            streakLeft -= dt
            if streakLeft <= 0 { streak = 0 }
        }
        if calloutLeft > 0 { calloutLeft -= dt }
        for pickup in pickups where pickup.alive {
            pickup.node.eulerAngles.y += dt * 1.4
            if let beacon = pickup.node.childNode(withName: "beacon", recursively: false) {
                let pulse = 1 + 0.28 * sin(missionTime * 5 + pickup.node.position.z)
                beacon.simdScale = simd_float3(repeating: pulse)
            }
            var gem = pickup.node.simdPosition
            let offset = position - gem
            let reach = simd_length(offset)
            if pickup.opened && reach < 170 && reach > 0.5 {
                let pull = min(reach, (190 - reach) * 3.2 * dt + 40 * dt)
                gem += safeNorm(offset) * pull
                pickup.node.simdPosition = gem
            }
            if simd_distance(gem, position) < (pickup.opened ? 28 : 9) {
                collect(pickup)
            }
        }
        let heat = enemies.contains { enemy in
            enemy.alive && !enemy.disabled && enemy.role == .bogey && simd_distance(enemy.position, position) < 190
        }
        audio.setMusic(phase == .combat && heat ? 1 : (phase == .combat ? 0.28 : 0.08))
        audio.setBeam(towed == nil ? 0 : 0.85)
        updateBeam()
        if !markedCombat && (firstKill > 0 && phaseTime > firstKill + 0.45 || phaseTime > 8) {
            markedCombat = true
            logMark("NR2 mark combat")
        }
    }

    private func steer(_ enemy: Enemy, _ dt: Float) {
        enemy.age += dt
        stepEnemyFX(enemy, dt)
        if enemy.role == .turret || enemy.role == .core {
            stepTurret(enemy, dt)
            return
        }
        if enemy.disabled || towed === enemy {
            if towed !== enemy {
                enemy.velocity *= 0.99
                enemy.position += enemy.velocity * dt
                enemy.node.simdPosition = enemy.position
                enemy.node.eulerAngles.x += dt * 0.4
                enemy.node.eulerAngles.z += dt * enemy.strafe * 0.6
            }
            return
        }
        let to = position - enemy.position
        let dist = simd_length(to)
        let dir = dist > 0.001 ? to / dist : simd_float3(0, 0, -1)
        var accel = simd_float3.zero
        if dist > 110 { accel += dir * 36 }
        else if dist < 46 { accel -= dir * 28 }
        let side = safeNorm(simd_cross(dir, simd_float3(0, 1, 0)))
        accel += side * enemy.strafe * 16
        if enemy.age > 3.2 {
            enemy.age = 0
            enemy.strafe = -enemy.strafe
        }
        let wantY: Float = 8 + sin(enemy.seed + missionTime * 0.6) * 4
        accel.y += (wantY - enemy.position.y) * 2.2
        enemy.velocity += accel * dt
        let sp = simd_length(enemy.velocity)
        if sp > 54 { enemy.velocity *= 54 / sp }
        enemy.position += enemy.velocity * dt
        let face = safeNorm(enemy.velocity + dir * 8)
        enemy.node.simdOrientation = lookOrientation(forward: face, up: simd_float3(0, 1, 0), roll: enemy.strafe * 0.4)
        enemy.node.simdPosition = enemy.position + enemy.jitter

        enemy.cooldown -= dt
        let aim = position + velocity * min(dist / 150, 0.65) - enemy.position
        if dist < 210 && enemy.cooldown <= 0 && simd_dot(face, safeNorm(aim)) > 0.86 && !died {
            enemy.cooldown = showcase ? 2.4 : 1.65
            shootEnemy(enemy, toward: safeNorm(aim))
        }
        if dist < 8 && hurt <= 0 && !died {
            hurtPlayer(36)
            destroy(enemy)
        }
    }

    // MARK: - b18 combat systems

    private lazy var sparkGeo: SCNGeometry = {
        let g = SCNSphere(radius: 0.22)
        g.segmentCount = 6
        g.materials = [whiteCore]
        return g
    }()

    private lazy var crateMat: SCNMaterial = {
        let m = SCNMaterial()
        m.fillMode = .lines
        m.lightingModel = .constant
        m.isDoubleSided = true
        m.diffuse.contents = UIColor(red: 1, green: 0.8, blue: 0.3, alpha: 1)
        return m
    }()

    private func register(_ enemy: Enemy) {
        enemy.id = nextEnemyID
        nextEnemyID += 1
        enemies.append(enemy)
    }

    private func sparks(at point: simd_float3, count: Int, speed: Float) {
        guard effects.count < 240 else { return }
        for _ in 0..<count {
            let node = SCNNode(geometry: sparkGeo)
            node.simdPosition = point
            scene.rootNode.addChildNode(node)
            let dir = safeNorm(simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1)))
            effects.append(Effect(node: node, life: Float.random(in: 0.18...0.36), start: 1, end: 0.2, spark: true, velocity: dir * speed * Float.random(in: 0.5...1.2)))
        }
    }

    private func spiralSpark(at point: simd_float3) {
        guard effects.count < 220 else { return }
        let node = SCNNode(geometry: sparkGeo)
        node.simdPosition = point
        scene.rootNode.addChildNode(node)
        effects.append(Effect(node: node, life: 0.3, start: 1.1, end: 0.15, spark: false, velocity: .zero))
    }

    private func hitEnemy(_ enemy: Enemy, bite: Float, at point: simd_float3, trickShot: Bool) {
        let before = enemy.hullMax > 1 ? enemy.hull / enemy.hullMax : 1
        enemy.hull -= bite * (trickShot ? 1.25 : 1)
        let after = enemy.hullMax > 1 ? max(0, enemy.hull / enemy.hullMax) : 0
        if lastHitID == enemy.id {
            hitStreak = min(3, hitStreak + 1)
        } else {
            lastHitID = enemy.id
            hitStreak = 0
        }
        audio.hitTick(streak: hitStreak)
        enemy.flashT = trickShot ? 0.24 : 0.11
        sparks(at: point, count: trickShot ? 7 : 4, speed: 18)
        if before > 0.5 && after <= 0.5 { enemy.volleys += 1 }
        if before > 0.2 && after <= 0.2 { enemy.volleys += 1 }
        if trickShot {
            score += 150
            bounty += 150
            trickShotFlash = 0.45
            flash = max(flash, 0.3)
            if popups.last?.text != "TRICK SHOT" {
                popups.append(Popup(position: enemy.position + simd_float3(0, 2.5, 0), text: "TRICK SHOT", age: 0))
            }
        }
        if !enemy.critical && enemy.hull > 0 && after < 0.3 {
            enemy.critical = true
            audio.warn()
        }
        if enemy.hull <= 0 {
            if enemy.role == .bandit { disable(enemy) } else { destroy(enemy) }
        }
    }

    private func stepEnemyFX(_ enemy: Enemy, _ dt: Float) {
        if enemy.flashT > 0 {
            enemy.flashT -= dt
            enemy.wire?.diffuse.contents = enemy.flashT > 0 ? UIColor.white : enemy.baseColor
        }
        if enemy.critical && !enemy.disabled {
            enemy.jitter = simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1)) * 0.22
            enemy.smokeClock -= dt
            if enemy.smokeClock <= 0 && effects.count < 230 {
                enemy.smokeClock = 0.07
                billboard(art.smoke, at: enemy.position, life: 1.1, start: 0.5, end: 2.6)
                billboard(art.fire, at: enemy.position, life: 0.3, start: 0.6, end: 1.2)
            }
        } else {
            enemy.jitter = .zero
        }
    }

    private func pointHint() {
        let next = enemies.filter { $0.alive && !$0.disabled }.min {
            simd_distance($0.position, position) < simd_distance($1.position, position)
        }
        hintEnemy = next
        hintLeft = next == nil ? 0 : 2.5
    }

    private func stepDyings(_ dt: Float) {
        for d in dyings {
            d.age += dt
            d.position += d.velocity * dt
            d.node.simdPosition = d.position + simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), 0) * 0.3
            if d.age >= 0.3 && !d.done {
                d.done = true
                let fake = Enemy(node: d.node, position: d.position, hull: 0, cooldown: 0, role: .bogey)
                killBurst(at: d.position, enemy: fake)
                audio.explosion(volume: 0.5)
                hitStop = max(hitStop, 0.1)
                d.node.removeFromParentNode()
                let right = safeNorm(simd_cross(safeNorm(d.position - position), simd_float3(0, 1, 0)))
                for side: Float in [-1, 1] where effects.count < 250 {
                    let half = d.node.clone()
                    half.simdScale = simd_float3(0.6, 0.6, 0.6)
                    half.simdPosition = d.position + right * side * 1.2
                    scene.rootNode.addChildNode(half)
                    let e = Effect(node: half, life: 1.7, start: 0.6, end: 0.45, spark: true,
                                   velocity: d.velocity + right * side * 11 + simd_float3(0, Float.random(in: -3...4), 0))
                    e.spin = simd_float3(Float.random(in: -4...4), Float.random(in: -4...4), side * 5)
                    e.trail = 0.07
                    e.solid = true
                    effects.append(e)
                }
            }
        }
        dyings.removeAll { $0.done }
    }

    private func addCrate(_ pickup: Pickup) {
        let box = SCNBox(width: 4.2, height: 4.2, length: 4.2, chamferRadius: 0.2)
        box.materials = [crateMat]
        let crate = SCNNode(geometry: box)
        crate.name = "crate"
        crate.renderingOrder = 40
        pickup.node.addChildNode(crate)
    }

    private func openCrate(_ pickup: Pickup) {
        pickup.opened = true
        pickup.node.childNode(withName: "crate", recursively: false)?.removeFromParentNode()
        sparks(at: pickup.node.simdPosition, count: 10, speed: 22)
        billboard(art.fire, at: pickup.node.simdPosition, life: 0.35, start: 0.6, end: 3.5)
        audio.crate()
        popups.append(Popup(position: pickup.node.simdPosition + simd_float3(0, 3, 0), text: pickup.kind.label, age: 0))
    }

    private func hitRock(_ rock: Rock, bite: Float, at point: simd_float3) {
        rock.hp -= bite
        sparks(at: point, count: 3, speed: 12)
        audio.hitTick(streak: 0)
        guard rock.hp <= 0 else { return }
        rock.alive = false
        rock.node.removeFromParentNode()
        explode(at: rock.position, power: 0.5, chain: false, sound: false)
        audio.secondaryBoom(volume: 0.26)
        for _ in 0..<6 where effects.count < 250 {
            let s = CGFloat(rock.radius * Float.random(in: 0.25...0.45))
            let chunk = SCNBox(width: s, height: s * 0.8, length: s * 1.1, chamferRadius: s * 0.12)
            chunk.materials = [art.debris]
            let node = SCNNode(geometry: chunk)
            node.simdPosition = rock.position
            scene.rootNode.addChildNode(node)
            let dir = safeNorm(simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1)))
            let e = Effect(node: node, life: 1.6, start: 1, end: 0.6, spark: true, velocity: dir * Float.random(in: 6...16))
            e.spin = simd_float3(Float.random(in: -3...3), Float.random(in: -3...3), Float.random(in: -3...3))
            e.solid = true
            effects.append(e)
        }
        for i in 0..<Int.random(in: 2...3) {
            let off = simd_float3(Float(i) * 2.5 - 2.5, 1.5, 0)
            dropPrize(at: rock.position + off, opened: true, kind: .credits)
        }
        addBounty(60, text: "ROCK CRACKED", at: rock.position)
    }

    /// Rocks and the Dreadnought hull are solid.
    private func collideWorld() {
        for rock in rocks where rock.alive {
            let d = position - rock.position
            let len = simd_length(d)
            let reach = rock.radius + 2.2
            if len < reach {
                let n = len > 0.01 ? d / len : simd_float3(0, 1, 0)
                position = rock.position + n * reach
                let vn = simd_dot(velocity, n)
                if vn < 0 { velocity -= 1.7 * vn * n }
                hurtPlayer(14)
                sparks(at: rock.position + n * rock.radius, count: 4, speed: 10)
            }
        }
        if bossActive && !bossFinale, let ship = dreadnought {
            let l = position - ship.simdPosition
            let lo = simd_float3(-35, -12, -155), hi = simd_float3(35, 20, 95)
            if l.x > lo.x && l.x < hi.x && l.y > lo.y && l.y < hi.y && l.z > lo.z && l.z < hi.z {
                let pens: [(Float, simd_float3)] = [
                    (l.x - lo.x, simd_float3(-1, 0, 0)), (hi.x - l.x, simd_float3(1, 0, 0)),
                    (l.y - lo.y, simd_float3(0, -1, 0)), (hi.y - l.y, simd_float3(0, 1, 0)),
                    (l.z - lo.z, simd_float3(0, 0, -1)), (hi.z - l.z, simd_float3(0, 0, 1)),
                ]
                let best = pens.min { $0.0 < $1.0 }!
                position += best.1 * (best.0 + 0.5)
                let vn = simd_dot(velocity, best.1)
                if vn < 0 { velocity -= 1.6 * vn * best.1 }
                hurtPlayer(10)
            }
        }
    }

    // MARK: - b18 Dreadnought boss

    private func startBoss() {
        guard !bossActive else { return }
        bossActive = true
        bossTime = 0
        spawnWarden()
        say("WARDEN INBOUND")
        audio.warn()
        audio.setMusic(1)
        guard let ship = dreadnought else { return }
        for side: Float in [-1, 1] {
            for z: Float in [-20, -70, -120] {
                let root = SCNNode()
                let base = SCNBox(width: 6, height: 3, length: 6, chamferRadius: 0.3)
                base.materials = [art.hullWorn]
                root.addChildNode(SCNNode(geometry: base))
                let eye = SCNSphere(radius: 1.6)
                eye.segmentCount = 10
                eye.materials = [art.redGlow]
                let eyeNode = SCNNode(geometry: eye)
                eyeNode.simdPosition = simd_float3(0, 2.2, 0)
                root.addChildNode(eyeNode)
                let wire = SCNMaterial()
                wire.fillMode = .lines
                wire.lightingModel = .constant
                wire.isDoubleSided = true
                wire.readsFromDepthBuffer = false
                wire.diffuse.contents = UIColor(red: 1, green: 0.35, blue: 0.2, alpha: 1)
                let cage = SCNBox(width: 8, height: 6, length: 8, chamferRadius: 0.05)
                cage.materials = [wire]
                let cageNode = SCNNode(geometry: cage)
                cageNode.renderingOrder = 40
                cageNode.simdPosition = simd_float3(0, 1.2, 0)
                root.addChildNode(cageNode)
                let local = simd_float3(side * 22, 9, z)
                root.simdPosition = ship.simdPosition + local
                scene.rootNode.addChildNode(root)
                let t = Enemy(node: root, position: root.simdPosition, hull: 160, cooldown: 2 + Float(turrets.count) * 0.35, role: .turret)
                t.hullMax = 160
                t.radius = 4.5
                t.local = local
                t.wire = wire
                t.baseColor = UIColor(red: 1, green: 0.35, blue: 0.2, alpha: 1)
                register(t)
                turrets.append(t)
            }
        }
    }

    private func stepTurret(_ enemy: Enemy, _ dt: Float) {
        guard let ship = dreadnought else { return }
        enemy.position = ship.simdPosition + enemy.local
        enemy.node.simdPosition = enemy.position + enemy.jitter
        enemy.cooldown -= dt
        let aim = position + velocity * 0.6 - enemy.position
        if simd_length(aim) < 320 && enemy.cooldown <= 0 && !died && bossTime > 3 {
            enemy.cooldown = enemy.role == .core ? 1.0 : Float.random(in: 1.9...2.8)
            shootEnemy(enemy, toward: safeNorm(aim))
        }
    }

    private func turretDown() {
        guard bossCore == nil, turrets.allSatisfy({ !$0.alive }), let ship = dreadnought else { return }
        let root = SCNNode()
        let ball = SCNSphere(radius: 4.2)
        ball.segmentCount = 20
        ball.materials = [art.redGlow]
        root.addChildNode(SCNNode(geometry: ball))
        let wire = SCNMaterial()
        wire.fillMode = .lines
        wire.lightingModel = .constant
        wire.isDoubleSided = true
        wire.readsFromDepthBuffer = false
        wire.diffuse.contents = UIColor(red: 1, green: 0.85, blue: 0.3, alpha: 1)
        let cage = SCNBox(width: 13, height: 13, length: 13, chamferRadius: 0.05)
        cage.materials = [wire]
        let cageNode = SCNNode(geometry: cage)
        cageNode.renderingOrder = 40
        root.addChildNode(cageNode)
        let local = simd_float3(0, 26, -40)
        root.simdPosition = ship.simdPosition + local
        scene.rootNode.addChildNode(root)
        let core = Enemy(node: root, position: root.simdPosition, hull: 900, cooldown: 1.5, role: .core)
        core.hullMax = 900
        core.radius = 8
        core.local = local
        core.wire = wire
        core.baseColor = UIColor(red: 1, green: 0.85, blue: 0.3, alpha: 1)
        register(core)
        bossCore = core
        say("CORE EXPOSED")
        audio.warn()
        explode(at: root.simdPosition, power: 1, chain: false)
    }

    private func bossDie(_ core: Enemy) {
        bossDead = true
        bossDeadTime = 0
        bossOutcome = "WARDEN DESTROYED"
        kills += 1
        core.node.removeFromParentNode()
        guard let ship = dreadnought else { return }
        for i in 0..<10 {
            let p = ship.simdPosition + simd_float3(Float.random(in: -30...30), Float.random(in: -8...18), Float.random(in: -140...80))
            pendingBooms.append((p, Float(i) * 0.25, Float.random(in: 0.8...1.3)))
        }
        say("CORE BREACHED")
    }

    private func stepBoss(_ dt: Float, raw: Float) {
        bossTime += dt
        guard let ship = dreadnought else { return }
        if !bossDead {
            let u = smoothstep(0, 9, bossTime)
            let z = mix(-1120, -800, 1 - (1 - u) * (1 - u))
            ship.simdPosition = simd_float3(0, 8, z)
            return
        }
        bossDeadTime += dt
        if !bossFinale && bossDeadTime > 2.5 {
            bossFinale = true
            let center = ship.simdPosition + simd_float3(0, 6, -30)
            audio.bigBoom(volume: 0.7)
            hitStop = max(hitStop, 0.12)
            killBurst(at: center, enemy: Enemy(node: ship, position: center, hull: 0, cooldown: 0, role: .bogey))
            explode(at: center, power: 2, chain: false, sound: false)
            let wave = SCNTorus(ringRadius: 2, pipeRadius: 0.3)
            wave.ringSegmentCount = 48
            wave.materials = [shockMat]
            let waveNode = SCNNode(geometry: wave)
            waveNode.simdPosition = center
            scene.rootNode.addChildNode(waveNode)
            effects.append(Effect(node: waveNode, life: 1.6, start: 1, end: 90, spark: false, velocity: .zero))
            flash = 1
            shake = 0.25
            let left = SCNNode(), right = SCNNode()
            left.name = "half"
            right.name = "half"
            for child in ship.childNodes {
                (child.simdPosition.x < 0 ? left : right).addChildNode(child)
            }
            ship.addChildNode(left)
            ship.addChildNode(right)
            addBounty(5000, text: "WARDEN DESTROYED", at: center)
            popups.append(Popup(position: center + simd_float3(0, 12, 0), text: "WARDEN DESTROYED", age: 0))
            audio.overdrive()
        }
        if bossFinale {
            for (i, half) in ship.childNodes.filter({ $0.name == "half" }).enumerated() {
                let side: Float = i == 0 ? -1 : 1
                half.simdPosition += simd_float3(side * 9, -2.5, 0) * dt
                half.simdOrientation = simd_quatf(angle: side * 0.12 * dt, axis: simd_float3(0, 0, 1)) * half.simdOrientation
            }
            if Float.random(in: 0...1) < dt * 6 && effects.count < 220 {
                let p = ship.simdPosition + simd_float3(Float.random(in: -40...40), Float.random(in: -10...16), Float.random(in: -150...90))
                billboard(art.fire, at: p, life: 0.8, start: 2, end: 9)
                billboard(art.smoke, at: p, life: 2, start: 3, end: 14)
            }
        }
    }

    private func stepWarden(_ raw: Float) {
        guard let ship = dreadnought else { return }
        let u = smoothstep(0.4, 11.5, phaseTime)
        let z = mix(-1120, -700, 1 - (1 - u) * (1 - u))
        ship.simdPosition = simd_float3(0, 8, z)
        rift.eulerAngles.y += raw * 0.05
        if !markedWarden && phaseTime > 4.8 {
            markedWarden = true
            logMark("NR2 mark warden")
        }
    }

    private func stepBolts(_ dt: Float) {
        for bolt in bolts where bolt.alive {
            if let target = bolt.home, target.alive, !target.disabled {
                let to = safeNorm(target.position - bolt.position)
                // b18: stronger homing; trick-shot bolts home fully.
                if bolt.trick || simd_dot(bolt.direction, to) > 0.3 {
                    let k = 1 - exp(-(bolt.trick ? 14 : 7) * dt)
                    bolt.direction = safeNorm(bolt.direction * (1 - k) + to * k)
                }
            }
            let next = bolt.position + bolt.direction * bolt.speed * dt
            if bolt.trick && dt > 0 {
                bolt.spin += dt * 26
                let side = safeNorm(simd_cross(bolt.direction, simd_float3(0, 1, 0)))
                let up = simd_cross(side, bolt.direction)
                let off = (side * cos(bolt.spin) + up * sin(bolt.spin)) * 0.9
                spiralSpark(at: bolt.position + off)
            }
            if bolt.fromPlayer {
                for enemy in enemies where enemy.alive && !enemy.disabled {
                    if segmentHits(bolt.position, next, enemy.position, radius: enemy.radius) {
                        bolt.alive = false
                        let bite: Float = bolt.missile ? (showcase ? 48 : 40) : (showcase ? 52 : 34) * (1 + 0.3 * Float(spreadLevel))
                        hitEnemy(enemy, bite: bite * (overdriveLeft > 0 ? 1.3 : 1), at: next, trickShot: bolt.trick)
                        break
                    }
                }
                if bolt.alive {
                    for pickup in pickups where pickup.alive && !pickup.opened {
                        if segmentHits(bolt.position, next, pickup.node.simdPosition, radius: 3.2) {
                            bolt.alive = false
                            openCrate(pickup)
                            break
                        }
                    }
                }
                if bolt.alive, let rock = rocks.first(where: { $0.alive && segmentHits(bolt.position, next, $0.position, radius: $0.radius) }) {
                    bolt.alive = false
                    hitRock(rock, bite: bolt.missile ? 60 : 34, at: next)
                }
            } else {
                if rocks.contains(where: { $0.alive && segmentHits(bolt.position, next, $0.position, radius: $0.radius) }) {
                    bolt.alive = false
                } else if !died && hurt <= 0 && segmentHits(bolt.position, next, position, radius: 2.3) {
                    bolt.alive = false
                    hurtPlayer(bolt.damage)
                }
            }
            bolt.position = next
            bolt.age += dt
            bolt.node.simdPosition = bolt.position
            bolt.node.simdOrientation = lookOrientation(forward: bolt.direction, up: simd_float3(0, 1, 0), roll: 0)
            if bolt.age > bolt.life || !bolt.alive {
                bolt.alive = false
                bolt.node.removeFromParentNode()
            }
        }
        bolts.removeAll { !$0.alive }
    }

    private func stepEffects(_ dt: Float) {
        var ripe: [(simd_float3, Float)] = []
        pendingBooms = pendingBooms.compactMap { boom in
            let delay = boom.1 - dt
            if delay <= 0 {
                ripe.append((boom.0, boom.2))
                return nil
            }
            return (boom.0, delay, boom.2)
        }
        for boom in ripe {
            explode(at: boom.0, power: boom.1, chain: false, sound: false)
            audio.secondaryBoom(volume: min(0.42, 0.18 + 0.2 * boom.1))
        }
        stepDyings(dt)
        var trails: [simd_float3] = []
        for effect in effects {
            effect.age += dt
            let u = min(1, effect.age / effect.life)
            effect.node.opacity = CGFloat(effect.solid ? (u < 0.75 ? 1 : (1 - u) * 4) : 1 - u)
            let s = effect.start + (effect.end - effect.start) * u
            effect.node.simdScale = simd_float3(s, s, s)
            if effect.spark {
                effect.node.simdPosition += effect.velocity * dt
            }
            if simd_length(effect.spin) > 0 {
                let q = simd_quatf(angle: simd_length(effect.spin) * dt, axis: safeNorm(effect.spin))
                effect.node.simdOrientation = q * effect.node.simdOrientation
            }
            if effect.trail > 0 {
                effect.trailClock -= dt
                if effect.trailClock <= 0 && u < 0.8 {
                    effect.trailClock = effect.trail
                    trails.append(effect.node.simdWorldPosition)
                }
            }
        }
        for point in trails where effects.count < 260 {
            billboard(art.fire, at: point, life: 0.35, start: 0.5, end: 1.6)
            billboard(art.smoke, at: point, life: 0.9, start: 0.6, end: 2.4)
        }
        if killChainLeft > 0 { killChainLeft -= dt }
        if hintLeft > 0 { hintLeft -= dt }
        if trickShotFlash > 0 { trickShotFlash -= dt }
        effects.removeAll { effect in
            if effect.age >= effect.life {
                effect.node.removeFromParentNode()
                return true
            }
            return false
        }
        for i in popups.indices {
            popups[i].age += dt
            popups[i].position.y += dt * 3
        }
        popups.removeAll { $0.age > 1.6 }
        flash = max(0, flash - dt * 2.4)
        shake = max(0, shake - dt * 3.5)
    }

    private func stepDebris() {
        let now = missionTime
        debris.removeAll { item in
            if now - item.born > 7.5 {
                item.node.removeFromParentNode()
                return true
            }
            return false
        }
    }

    /// Portrait keeps the iPhone chase framing. Landscape tightens the vertical
    /// angle so the fighter stays large on a wide iPad.
    private func verticalFieldOfView(boost: Float, shake: Float) -> CGFloat {
        let wide = viewportAspect > 1.05
        let base: CGFloat = wide ? 46 : 56
        let boostGain: CGFloat = wide ? 6 : 8
        return base + CGFloat(boost) * boostGain * 0.35  // b17: no shake FOV pump, subtle boost.
    }

    /// Fits the canopy and the instrument panel to the current field of view.
    private func layoutCockpit() {
        let dist: Float = 0.7
        let vfov = Float(camera.fieldOfView) * .pi / 180
        let halfH = tan(max(0.25, vfov) * 0.5) * dist
        let halfW = halfH * max(0.42, viewportAspect)
        let z = -dist
        func place(_ name: String, _ p: simd_float3, _ scale: simd_float3 = simd_float3(1, 1, 1)) {
            guard let node = cockpit.childNode(withName: name, recursively: false) else { return }
            node.simdPosition = p
            node.simdScale = scale
        }
        place("railL", simd_float3(-halfW * 0.9, halfH * 0.06, z), simd_float3(1, halfH * 1.5, 1))
        place("railR", simd_float3(halfW * 0.9, halfH * 0.06, z), simd_float3(1, halfH * 1.5, 1))
        place("bow", simd_float3(0, halfH * 0.84, z), simd_float3(halfW * 1.8, 1, 1))
        let dashH = halfH * 0.52
        let dashY = -halfH + dashH * 0.5
        place("dash", simd_float3(0, dashY, z), simd_float3(halfW * 1.84, dashH, 1))
        let front = z + 0.045
        let left = -halfW * 0.78
        let row = dashY + dashH * 0.18
        place("capSpeed", simd_float3(left, row + halfH * 0.16, front))
        place("speedText", simd_float3(left, row + halfH * 0.05, front))
        place("capShield", simd_float3(left, row - halfH * 0.04, front))
        place("shieldFill", simd_float3(left, row - halfH * 0.1, front), simd_float3(max(0.05, shield / max(shieldCap, 1)), 1, 1))
        place("capHull", simd_float3(left + halfW * 0.55, row - halfH * 0.04, front))
        place("hullFill", simd_float3(left + halfW * 0.55, row - halfH * 0.1, front), simd_float3(max(0.05, hull / 100), 1, 1))
        place("capWeapon", simd_float3(left + halfW * 1.05, row - halfH * 0.04, front))
        place("weaponFill", simd_float3(left + halfW * 1.05, row - halfH * 0.1, front), simd_float3(max(0.05, weapon / 100), 1, 1))
        let targetX = halfW * 0.08
        place("capTarget", simd_float3(targetX, row + halfH * 0.12, front))
        place("targetText", simd_float3(targetX, row + halfH * 0.02, front))
        let lockFrac: Float = hud.lockTitle.isEmpty ? 0.05 : max(0.05, hud.lockHealth)
        place("targetFill", simd_float3(targetX, row - halfH * 0.08, front), simd_float3(lockFrac, 1, 1))
        radarDisc?.simdPosition = simd_float3(halfW * 0.58, dashY + dashH * 0.02, front)
        place("capRadar", simd_float3(halfW * 0.48, dashY + dashH * 0.28, front))
        place("grip", simd_float3(0, dashY - dashH * 0.15, front + 0.02))
        let fwd = forward()
        let right = safeNorm(simd_cross(fwd, simd_float3(0, 1, 0)))
        var slot = 0
        for enemy in enemies where enemy.alive {
            guard slot < radarBlips.count else { break }
            let rel = enemy.position - position
            let side = max(-1, min(1, simd_dot(rel, right) / 200))
            let ahead = max(-1, min(1, simd_dot(rel, fwd) / 200))
            radarBlips[slot].isHidden = false
            radarBlips[slot].simdPosition = simd_float3(side * 0.062, ahead * 0.062, 0.01)
            slot += 1
        }
        if slot < radarBlips.count {
            for index in slot..<radarBlips.count {
                radarBlips[index].isHidden = true
            }
        }
    }

    private func updateCamera(_ raw: Float) {
        let fwd = forward()
        // b18: chase pulled further back and higher so the ship is ~15-20% of the width.
        let chasePos = position - fwd * 26 + simd_float3(0, 7.5, 0)
        let chaseLook = position + fwd * 30 + simd_float3(0, 0.4, 0)
        var desired = chasePos
        var look = chaseLook
        var rollCam: Float = 0  // b17: chase camera never rolls with the ship.

        if cockpitOn && phase == .combat {
            let eye = position + simd_float3(0, 0.55, 0) + fwd * 0.8
            desired = eye
            look = eye + fwd * 40
            rollCam = roll * 0.85
        } else if phase == .cinema {
            let launch = smoothstep(2.6, 7.6, phaseTime)
            let scripted = simd_float3(sin(phaseTime * 0.2) * 1.4, mix(6.4, 8.0, launch), mix(116, position.z + 14, launch))
            let scriptLook = position + simd_float3(0, 1.1, -36)
            let blend = smoothstep(6.8, 8.4, phaseTime)
            desired = mix3(scripted, chasePos, blend)
            look = mix3(scriptLook, chaseLook, blend)
            rollCam *= blend
        } else if phase == .warden {
            let u = smoothstep(0.2, 4.2, phaseTime)
            let wide = simd_float3(-36, 28, -560)
            let wideLook = simd_float3(10, 12, -860)
            desired = mix3(chasePos, wide, u)
            look = mix3(chaseLook, wideLook, u)
            rollCam *= (1 - u)
        } else if trick != nil {
            // b17: steady straight-back view through loops and rolls, no swing.
            let back = simd_float3(sin(trickCamYaw), 0, -cos(trickCamYaw))
            desired = position - back * 26 + simd_float3(0, 7.5, 0)
            look = position + back * 30 + simd_float3(0, 0.4, 0)
        }
        var aerial = false
        if viewMode == 1 && phase == .combat {
            // b18 AERIAL: high, steady three-quarter overhead. Frames the ship and its
            // locked target; the heading eases slowly and the camera never rolls or spins.
            aerial = true
            let headYaw = trick != nil ? trickCamYaw : yaw
            var delta = headYaw - aerialYaw
            delta = atan2(sin(delta), cos(delta))
            aerialYaw += delta * (1 - exp(-0.6 * raw))
            var center = position
            var span: Float = 40
            if let target = lockedEnemy, target.alive {
                center = (position + target.position) * 0.5
                span = min(200, simd_distance(position, target.position))
            }
            let kc = 1 - exp(-2.5 * raw)
            if !camReady {
                aerialCenter = center
                aerialSpan = span
            } else {
                aerialCenter = mix3(aerialCenter, center, kc)
                aerialSpan += (span - aerialSpan) * kc
            }
            let back = simd_float3(sin(aerialYaw), 0, -cos(aerialYaw))
            desired = aerialCenter - back * (30 + aerialSpan * 0.45) + simd_float3(0, 38 + aerialSpan * 0.55, 0)
            look = aerialCenter
            rollCam = 0
        }

        // b17: rock-steady chase. Fixed offset, near-instant critically damped follow.
        let chaseLocked = !(cockpitOn && phase == .combat) && phase != .cinema && phase != .warden
        var kPos = chaseLocked ? 1 - exp(-28 * raw) : 1 - exp(-4.2 * raw)
        var kLook = chaseLocked ? 1 - exp(-32 * raw) : 1 - exp(-6.5 * raw)
        if aerial {
            kPos = 1 - exp(-6 * raw)
            kLook = 1 - exp(-8 * raw)
        }
        if !camReady {
            camPos = desired
            camLook = look
            camReady = true
        } else {
            camPos = mix3(camPos, desired, kPos)
            camLook = mix3(camLook, look, kLook)
        }
        let t = missionTime
        let jitter = simd_float3(sin(t * 41), cos(t * 37), 0) * shake * (aerial ? 0.08 : 0.18)
        cameraNode.simdPosition = camPos + jitter
        let camFwd = safeNorm(camLook - camPos)
        cameraNode.simdOrientation = lookOrientation(forward: camFwd, up: simd_float3(0, 1, 0), roll: rollCam)
        let boost = max(0, min(1, simd_dot(velocity, fwd) / 90))
        camera.fieldOfView = verticalFieldOfView(boost: boost, shake: shake)
        layoutCockpit()
        let cinema = phase == .cinema || phase == .warden
        camera.wantsDepthOfField = profile.dof && cinema
        camera.focusDistance = cinema ? 28 : 18
    }

    private func updateLights() {
        let spool: Float
        if phase == .cinema {
            spool = smoothstep(1.6, 3.6, phaseTime)
        } else {
            spool = 0.55 + min(1, simd_length(velocity) / 80) * 0.45
        }
        engineLight.light?.intensity = CGFloat(700 * spool)
        engineLight.simdPosition = worldPoint(simd_float3(0, 0, 3.6))
        flashLight.light?.intensity = CGFloat(flash * 2200)
    }

    private func updateMarkers(_ raw: Float) {
        for (index, child) in rift.childNodes.enumerated() where child.name == "spiral" {
            child.eulerAngles.z += (index == 0 ? 0.15 : -0.11) * raw
        }
        if let deck = scene.rootNode.childNode(withName: "cloudDeck", recursively: true) {
            deck.eulerAngles.y += raw * 0.02
        }
        if phase == .combat {
            let prompt = phaseTime < 7 ? Float(1) : max(0, 1 - (phaseTime - 7) / 1.4)
            hud.promptAlpha = died ? 0 : prompt
            hud.letterbox = bossActive && bossTime < 3 ? 1 - smoothstep(2.2, 3, bossTime) : 0
            hud.titleAlpha = 0
        } else if phase == .results {
            hud.letterbox = 1
            hud.promptAlpha = 0
            hud.titleAlpha = 0
        } else if phase == .warden {
            hud.letterbox = 1
            hud.promptAlpha = 0
            hud.titleAlpha = 0
        }
    }

    /// b17: one strong bolt per shot from the nose, slight homing toward the lock.
    private func shootPlayer() {
        let hard = aimEnemy()
        let tricking = trick != nil
        var origin = worldPoint(simd_float3(0, 0, -1.6)) + forward() * 2.0
        var dir = forward()
        if tricking {
            // b18: mid-trick the nose spins, so aim from the lock, not the nose.
            let heading = simd_float3(sin(trickCamYaw), 0, -cos(trickCamYaw))
            if let hard {
                dir = safeNorm(hard.position - position)
            } else {
                dir = heading
            }
            origin = position + dir * 3.2
        } else if let hard {
            let to = safeNorm(hard.position - origin)
            let blend: Float = 0.8
            dir = safeNorm(dir * (1 - blend) + to * blend)
        }
        spawnBolt(origin: origin, direction: dir, speed: 280, life: 1.25, player: true, home: hard, mat: art.boltPlayer, missile: false, trick: tricking && hard != nil)
        // Missile volleys at 50% and 20% of the locked target's hull, only while fire is held.
        if missileLevel > 0, let hard, hard.volleys > 0 {
            hard.volleys -= 1
            let count = missileLevel >= 2 ? 3 : 2
            for i in 0..<count {
                let side = Float(i) - Float(count - 1) * 0.5
                let right = safeNorm(simd_cross(forward(), simd_float3(0, 1, 0)))
                let o = position + right * side * 2.2 + simd_float3(0, -0.4, 0) + dir * 2
                spawnBolt(origin: o, direction: safeNorm(dir + right * side * 0.25), speed: 95, life: 3.4, player: true, home: hard, mat: art.orangeGlow, missile: true, trick: false)
            }
            say("MISSILES AWAY")
        } else if missileLevel > 0 && missileClock <= 0, let hard {
            missileClock = 1.35
            let origin = position + dir * 2 + simd_float3(0, -0.4, 0)
            spawnBolt(origin: origin, direction: safeNorm(hard.position - origin), speed: 90, life: 3.2, player: true, home: hard, mat: art.orangeGlow, missile: true, trick: false)
        } else {
            missileClock = max(0, missileClock - 0.13)
        }
        audio.shot()
        haptics.shot()
    }

    private func shootEnemy(_ enemy: Enemy, toward: simd_float3) {
        let origin = enemy.position + toward * (enemy.radius + 1)
        spawnBolt(origin: origin, direction: toward, speed: 125, life: enemy.role == .bandit || enemy.role == .bogey ? 2.4 : 3.4, player: false, home: nil, mat: art.boltEnemy, missile: false, trick: false)
    }

    private func spawnBolt(origin: simd_float3, direction: simd_float3, speed: Float, life: Float, player: Bool, home: Enemy?, mat: SCNMaterial, missile: Bool, trick: Bool) {
        let length: CGFloat = missile ? 6.4 : (player ? 6.0 : 3.2)
        let thick: CGFloat = missile ? 0.28 : (player ? 0.3 : 0.14)
        let box = SCNBox(width: thick, height: thick, length: length, chamferRadius: 0)
        box.materials = [mat]
        let node = SCNNode(geometry: box)
        node.simdPosition = origin
        node.simdOrientation = lookOrientation(forward: direction, up: simd_float3(0, 1, 0), roll: 0)
        scene.rootNode.addChildNode(node)
        let bolt = Bolt(node: node, position: origin, direction: direction, speed: speed, life: life, fromPlayer: player, home: home)
        bolt.missile = missile
        bolt.trick = trick
        bolts.append(bolt)
    }

    private func spawnEnemy(at point: simd_float3, role: ShipRole) {
        let node = Meshes.interceptor(art: art)
        node.simdPosition = point
        let cage = SCNBox(width: 8.4, height: 3.6, length: 9.2, chamferRadius: 0.05)
        let wire = SCNMaterial()
        wire.fillMode = .lines
        wire.lightingModel = .constant
        wire.isDoubleSided = true
        wire.readsFromDepthBuffer = false
        wire.diffuse.contents = role == .bandit
            ? UIColor(red: 1, green: 0.72, blue: 0.22, alpha: 1)
            : UIColor(red: 1, green: 0.2, blue: 0.1, alpha: 1)
        cage.materials = [wire]
        let outline = SCNNode(geometry: cage)
        outline.name = "cage"
        outline.renderingOrder = 40
        node.addChildNode(outline)
        scene.rootNode.addChildNode(node)
        let hull: Float = showcase ? (role == .bandit ? 42 : 50) : (role == .bandit ? 78 : 96)
        let enemy = Enemy(node: node, position: point, hull: hull, cooldown: showcase ? 2.6 : 1.3 + Float(spawned % 3) * 0.25, role: role)
        enemy.hullMax = hull
        enemy.wire = wire
        enemy.baseColor = wire.diffuse.contents as? UIColor ?? .white
        register(enemy)
    }

    private func disable(_ enemy: Enemy) {
        guard enemy.alive, !enemy.disabled else { return }
        enemy.disabled = true
        enemy.hull = 0
        if firstKill < 0 { firstKill = phaseTime }
        say("DISABLED - BEAM NOW")
        popups.append(Popup(position: enemy.position, text: "BEAM NOW", age: 0))
        haptics.hit()
        audio.chime()
        streak += 1
        bestStreak = max(bestStreak, streak)
        streakLeft = 4.5
        explode(at: enemy.position + simd_float3(0, 0.4, 0), power: 0.45, chain: false)
        audio.secondaryBoom(volume: 0.3)
        hitStop = max(hitStop, 0.06)
        if chosenEnemy === enemy { chosenEnemy = nil }
        pointHint()
        dropPrize(at: enemy.position + simd_float3(6, 1, -4), opened: true)
    }

    private func destroy(_ enemy: Enemy) {
        guard enemy.alive else { return }
        enemy.alive = false
        if towed === enemy { towed = nil }
        if cycled === enemy { cycled = nil }
        if chosenEnemy === enemy { chosenEnemy = nil }
        if enemy.role == .core {
            bossDie(enemy)
            return
        }
        kills += 1
        if firstKill < 0 { firstKill = phaseTime }
        if enemy.role == .turret {
            addBounty(600, text: "TURRET DOWN", at: enemy.position)
        } else {
            addBounty(280, text: "BOGEY DOWN", at: enemy.position)
        }
        if trick != nil {
            addBounty(500, text: "TRICK SHOT KILL", at: enemy.position + simd_float3(0, 4, 0))
            trickShotFlash = 0.5
        }
        streak += 1
        bestStreak = max(bestStreak, streak)
        streakLeft = 4.5
        // b18 multi-stage death: secondary booms now, the core flash, shockwave and split after.
        let p = enemy.position
        explode(at: p + simd_float3(1.2, 0.5, 0), power: 0.5, chain: false, sound: false)
        audio.secondaryBoom(volume: 0.32)
        pendingBooms.append((p + simd_float3(-1.5, -0.4, 1), 0.12, 0.55))
        dyings.append(Dying(node: enemy.node, position: p, velocity: enemy.velocity * 0.4, age: 0, big: enemy.role == .turret))
        killChain = killChainLeft > 0 ? killChain + 1 : 1
        killChainLeft = 3
        if streak >= 2 && killChain < 2 { say("\(streak)x STREAK") }
        let dist = simd_distance(enemy.position, position)
        if dist < 120 {
            shake = min(0.25, shake + 0.2)
        }
        if enemy.role != .turret { dropPrize(at: enemy.position + simd_float3(-5, 2, 3), opened: true) }
        if enemy.role == .turret { turretDown() }
        pointHint()
    }

    private func hurtPlayer(_ amount: Float) {
        guard !died, hurt <= 0 else { return }
        hurt = 1.15
        regenWait = 2.3
        var left = amount
        if shield > 0 {
            let used = min(shield, left)
            shield -= used
            left -= used
        }
        if left > 0 { hull -= left }
        haptics.hit()
        flash = max(flash, 0.35)
        shake = min(0.25, shake + 0.15)
        if hull <= 0 {
            hull = 0
            died = true
            explode(at: position, power: 1.45, chain: true)
            player.isHidden = true
            haptics.boom()
        }
    }

    /// b17: the satisfying part of a kill. White flash core, big fireball, glowing
    /// hull chunks, a shockwave ring, a punchy haptic and a clear score popup.
    private func killBurst(at point: simd_float3, enemy: Enemy) {
        haptics.kill()
        flash = min(1, flash + 0.6)
        let core = SCNSphere(radius: 1)
        core.segmentCount = 16
        core.materials = [whiteCore]
        let coreNode = SCNNode(geometry: core)
        coreNode.simdPosition = point
        scene.rootNode.addChildNode(coreNode)
        effects.append(Effect(node: coreNode, life: 0.22, start: 1.5, end: 5.5, spark: false, velocity: .zero))
        billboard(art.fire, at: point, life: 0.9, start: 1.6, end: 9.5)
        billboard(art.fire, at: point, life: 0.5, start: 1.0, end: 6.5)
        let wave = SCNTorus(ringRadius: 1.4, pipeRadius: 0.12)
        wave.ringSegmentCount = 40
        wave.pipeSegmentCount = 8
        wave.materials = [shockMat]
        let waveNode = SCNNode(geometry: wave)
        waveNode.simdPosition = point
        waveNode.simdOrientation = cameraNode.simdOrientation * simd_quatf(angle: .pi / 2, axis: simd_float3(1, 0, 0))
        scene.rootNode.addChildNode(waveNode)
        effects.append(Effect(node: waveNode, life: 0.6, start: 1, end: 16, spark: false, velocity: .zero))
        for _ in 0..<10 {
            let s = CGFloat(Float.random(in: 0.5...1.3))
            let chunk = SCNBox(width: s, height: s * 0.5, length: s * 1.3, chamferRadius: 0.03)
            chunk.materials = [hotDebris]
            let node = SCNNode(geometry: chunk)
            node.simdPosition = point
            node.simdOrientation = simd_quatf(angle: Float.random(in: 0...6.28), axis: safeNorm(simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), 0.3)))
            scene.rootNode.addChildNode(node)
            let dir = safeNorm(simd_float3(Float.random(in: -1...1), Float.random(in: -0.6...1), Float.random(in: -1...1)))
            effects.append(Effect(node: node, life: 1.1, start: 1, end: 0.35, spark: true, velocity: dir * Float.random(in: 10...28)))
        }
        popups.append(Popup(position: point + simd_float3(0, 3, 0), text: killChain > 1 ? "KILL x\(killChain)" : "KILL", age: 0))
        if killChain > 1 { say("KILL x\(killChain)") }
    }

    private func explode(at point: simd_float3, power: Float, chain: Bool, sound: Bool = true) {
        if sound { audio.explosion(volume: power > 0.9 ? 0.62 : 0.4) }
        haptics.boom()
        flash = min(1, flash + 0.85 * power)
        flashLight.simdPosition = point
        flashLight.light?.attenuationEndDistance = CGFloat(70 + 80 * power)
        shake = min(0.25, shake + 0.12 * power)
        billboard(art.fire, at: point, life: 0.22, start: 0.3, end: 2.2 * power)
        billboard(art.fire, at: point, life: 0.7, start: 0.8, end: 5.5 * power)
        billboard(art.smoke, at: point + simd_float3(0, 0.6, 0), life: 1.6, start: 1.1, end: 7 * power)
        let ring = SCNTorus(ringRadius: 1.2, pipeRadius: 0.08)
        ring.ringSegmentCount = 28
        ring.pipeSegmentCount = 8
        ring.materials = [art.orangeGlow]
        let ringNode = SCNNode(geometry: ring)
        ringNode.simdPosition = point
        ringNode.eulerAngles.x = Float.pi / 2
        scene.rootNode.addChildNode(ringNode)
        effects.append(Effect(node: ringNode, life: 0.55, start: 1, end: 9 * power, spark: false, velocity: .zero))
        if chain && power > 0.75 {
            let kick = simd_float3(Float.random(in: -4...4), Float.random(in: 0...3), Float.random(in: -4...4))
            pendingBooms.append((point + kick, 0.18, power * 0.62))
            pendingBooms.append((point - kick, 0.34, power * 0.4))
        }

        for _ in 0..<profile.sparks {
            let spark = SCNSphere(radius: 0.12)
            spark.segmentCount = 6
            spark.materials = [art.orangeGlow]
            let node = SCNNode(geometry: spark)
            node.simdPosition = point
            scene.rootNode.addChildNode(node)
            let dir = simd_normalize(simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1)))
            effects.append(Effect(node: node, life: 0.38, start: 1, end: 0.3, spark: true, velocity: dir * Float.random(in: 18...55)))
        }

        for _ in 0..<profile.debris {
            let s = Float.random(in: 0.35...1.15)
            let box = SCNBox(width: CGFloat(s), height: CGFloat(s * 0.7), length: CGFloat(s * 1.4), chamferRadius: 0.02)
            box.materials = [art.debris]
            let node = SCNNode(geometry: box)
            node.simdPosition = point
            let body = SCNPhysicsBody(type: .dynamic, shape: nil)
            body.mass = 30
            body.isAffectedByGravity = false
            body.damping = 0.05
            body.angularDamping = 0.05
            body.categoryBitMask = 32
            body.collisionBitMask = 32
            body.contactTestBitMask = 0
            let kick = simd_float3(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1))
            body.velocity = SCNVector3((safeNorm(kick) * Float.random(in: 8...26)).x,
                                       (safeNorm(kick) * 12).y,
                                       (safeNorm(kick) * Float.random(in: 8...26)).z)
            body.angularVelocity = SCNVector4(Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: -1...1), Float.random(in: 2...8))
            node.physicsBody = body
            scene.rootNode.addChildNode(node)
            debris.append(Debris(node: node, born: missionTime))
            if debris.count > profile.debris * 3, let old = debris.first {
                old.node.removeFromParentNode()
                debris.removeFirst()
            }
        }
    }

    private func puff(at local: simd_float3) {
        guard effects.filter({ $0.spark }).count < 8 else { return }
        let node = SCNNode(geometry: {
            let s = SCNSphere(radius: 0.18)
            s.segmentCount = 6
            s.materials = [art.smoke]
            return s
        }())
        node.simdPosition = worldPoint(local)
        scene.rootNode.addChildNode(node)
        effects.append(Effect(node: node, life: 0.4, start: 0.4, end: 2.2, spark: true, velocity: -forward() * 2 + simd_float3(0, 0.4, 0)))
    }

    private func placePlayer() {
        player.simdPosition = position
        player.simdOrientation = lookOrientation(forward: forward(), up: simd_float3(0, 1, 0), roll: roll)
    }

    private func forward() -> simd_float3 {
        simd_normalize(simd_float3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)))
    }

    private func worldPoint(_ local: simd_float3) -> simd_float3 {
        let p = player.simdWorldTransform * simd_float4(local, 1)
        return simd_float3(p.x, p.y, p.z)
    }

    private func yawError(toward point: simd_float3) -> Float {
        let f = forward()
        let to = point - position
        let fx = f.x, fz = f.z
        let tx = to.x, tz = to.z
        let fl = hypot(fx, fz)
        let tl = hypot(tx, tz)
        if fl < 0.001 || tl < 0.001 { return 0 }
        return (fx / fl) * (tz / tl) - (fz / fl) * (tx / tl)
    }

    private func billboard(_ material: SCNMaterial, at point: simd_float3, life: Float, start: Float, end: Float) {
        let plane = SCNPlane(width: 6, height: 6)
        plane.materials = [material]
        let node = SCNNode(geometry: plane)
        node.simdPosition = point
        node.constraints = [SCNBillboardConstraint()]
        scene.rootNode.addChildNode(node)
        effects.append(Effect(node: node, life: life, start: start, end: end, spark: false, velocity: .zero))
    }

    private func say(_ text: String) {
        callout = text
        calloutLeft = 1.6
    }

    private func addBounty(_ amount: Int, text: String, at point: simd_float3) {
        let gain = amount * max(1, multiplier)
        bounty += gain
        score += gain
        popups.append(Popup(position: point, text: "+\(gain)", age: 0))
        let next = bounty >= 2400 ? "ACE" : (bounty >= 800 ? "HUNTER" : "ROOKIE")
        if next != rank {
            rank = next
            say("RANK UP  \(rank)")
            audio.titleHit()
        } else {
            say(text)
        }
        haptics.pickup()
        audio.chime()
    }

    private func tryDeliver() {
        guard let ship = towed, simd_distance(position, dropoff) < 72 else { return }
        towed = nil
        ship.alive = false
        ship.node.removeFromParentNode()
        deliveries += 1
        addBounty(900, text: "BOUNTY SECURED", at: dropoff)
        say("DELIVERED  \(deliveries)/\(captureGoal)")
        popups.append(Popup(position: dropoff, text: "DELIVERED", age: 0))
        flash = 1
        shake = min(0.25, shake + 0.15)
        haptics.launch()
        audio.titleHit()
    }

    private func dropPrize(at point: simd_float3, opened: Bool = false, kind forced: PrizeKind? = nil) {
        guard pickups.filter(\.alive).count < 12 else { return }
        let kind = forced ?? (PrizeKind(rawValue: Int.random(in: 0..<6)) ?? .credits)
        let node = Meshes.pickup(art: art)
        node.simdPosition = point
        adornPickup(node)
        scene.rootNode.addChildNode(node)
        let pickup = Pickup(node: node, kind: kind)
        pickup.opened = opened
        if !opened { addCrate(pickup) }
        pickups.append(pickup)
    }

    private func adornPickup(_ node: SCNNode) {
        let beacon = SCNSphere(radius: 1.15)
        beacon.segmentCount = 10
        let glow = SCNMaterial()
        glow.lightingModel = .constant
        glow.diffuse.contents = UIColor(red: 1, green: 0.82, blue: 0.35, alpha: 1)
        glow.emission.contents = UIColor(red: 1, green: 0.82, blue: 0.35, alpha: 1)
        glow.transparency = 0.42
        beacon.materials = [glow]
        let mark = SCNNode(geometry: beacon)
        mark.name = "beacon"
        node.addChildNode(mark)
        let lamp = SCNNode()
        lamp.light = SCNLight()
        lamp.light?.type = .omni
        lamp.light?.intensity = 520
        lamp.light?.color = UIColor(red: 1, green: 0.78, blue: 0.32, alpha: 1)
        lamp.light?.attenuationEndDistance = 46
        node.addChildNode(lamp)
    }

    private func collect(_ pickup: Pickup) {
        pickup.alive = false
        let point = pickup.node.simdPosition
        pickup.node.removeFromParentNode()
        switch pickup.kind {
        case .shield:
            shield = shieldCap
            ShipUpgrades.unlock("shields")
            say("SHIELD UP")
        case .repair:
            hull = min(100, hull + 40)
            ShipUpgrades.unlock("reactor")
            say("HULL REPAIR")
        case .spread:
            spreadLevel = min(2, spreadLevel + 1)
            ShipUpgrades.unlock("spread")
            say("SPREAD GUNS")
        case .missile:
            missileLevel = min(2, missileLevel + 1)
            ShipUpgrades.unlock("missiles")
            say("MISSILES")
        case .credits:
            addBounty(220, text: "CREDITS", at: point)
        case .multi:
            multiplier = min(4, multiplier + 1)
            say("\(multiplier)x PAY")
        }
        if pickup.kind != .credits {
            popups.append(Popup(position: point, text: callout, age: 0))
            score += 120
        }
        haptics.pickup()
        audio.chime()
        collectTimes.append(missionTime)
        collectTimes.removeAll { missionTime - $0 > 4 }
        if collectTimes.count >= 3 {
            collectTimes.removeAll()
            overdriveLeft = 8
            heat = 0
            overheated = false
            say("OVERDRIVE")
            popups.append(Popup(position: position + forward() * 12 + simd_float3(0, 3, 0), text: "OVERDRIVE", age: 0))
            audio.overdrive()
            haptics.launch()
        }
    }

    private func nearestHostile() -> Enemy? {
        if let cycled, cycled.alive, !cycled.disabled { return cycled }
        return enemies.filter { $0.alive && !$0.disabled }.min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    private func nearestDisabled(maxDistance: Float) -> Enemy? {
        enemies.filter { $0.alive && $0.disabled && simd_distance($0.position, position) < maxDistance }
            .min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    /// b17: one targeting system. Nearest enemy inside the forward cone, auto-locked.
    static let lockCone: Float = 0.82
    private func aimEnemy() -> Enemy? {
        if let lockedEnemy, lockedEnemy.alive, !lockedEnemy.disabled { return lockedEnemy }
        return nil
    }

    private func updateLock() {
        frameLock.lock()
        let pick = pendingPick
        pendingPick = nil
        frameLock.unlock()
        if let pick, phase == .combat, !died,
           let chosen = enemies.first(where: { $0.id == pick && $0.alive && !$0.disabled }) {
            if chosen !== chosenEnemy {
                chosenEnemy = chosen
                lockedEnemy = nil
                say("TARGET LOCKED")
                haptics.hit()
            }
        }
        if let c = chosenEnemy, !(c.alive && !c.disabled && simd_distance(c.position, position) < 600 && phase == .combat && !died) {
            chosenEnemy = nil
        }
        if let chosenEnemy {
            if chosenEnemy !== lockedEnemy {
                audio.lockOn()
                lockAge = 0
            }
            lockedEnemy = chosenEnemy
            return
        }
        var next = (phase == .combat && !died) ? lockTarget(cone: FlightWorld.lockCone) : nil
        if phase == .combat, !died, let current = lockedEnemy, current.alive, !current.disabled {
            let to = current.position - position
            let dist = simd_length(to)
            if dist < 280 && dist > 0.01 && simd_dot(forward(), to / dist) > FlightWorld.lockCone - 0.08 { next = current }
        }
        if let next, next !== lockedEnemy {
            audio.lockOn()
            lockAge = 0
        }
        lockedEnemy = next
    }

    private func updateBeam() {
        guard let ship = towed else {
            beamNode.isHidden = true
            return
        }
        beamNode.isHidden = false
        let mid = (position + ship.position) * 0.5
        beamNode.simdPosition = mid
        let span = max(1, simd_distance(position, ship.position))
        beamNode.simdScale = simd_float3(1, span, 1)
        beamNode.simdOrientation = beamOrientation(safeNorm(ship.position - position))
    }

    private func beamOrientation(_ direction: simd_float3) -> simd_quatf {
        let dir = safeNorm(direction)
        let up = simd_float3(0, 1, 0)
        let dot = simd_dot(up, dir)
        if dot > 0.999 { return simd_quatf(ix: 0, iy: 0, iz: 0, r: 1) }
        if dot < -0.999 { return simd_quatf(angle: .pi, axis: simd_float3(1, 0, 0)) }
        return simd_quatf(from: up, to: dir)
    }

    private func objectiveLine() -> String {
        if phase != .combat { return "LEFT DRIVES  ·  RIGHT AIMS" }
        if bossActive {
            if bossDead { return "WARDEN DESTROYED" }
            if let core = bossCore, core.alive { return "DESTROY THE CORE" }
            return "TURRETS \(turrets.filter { !$0.alive }.count)/\(turrets.count)"
        }
        if towed != nil { return "TOW TO FREIGHTER" }
        if nearestDisabled(maxDistance: 800) != nil { return "DISABLED - BEAM NOW" }
        if enemies.contains(where: { $0.alive && $0.role == .bandit && !$0.disabled }) {
            return "DISABLE BANDITS  \(deliveries)/\(captureGoal)"
        }
        return "FIGHT THE BOGEYS"
    }

    private func guidePoint() -> (simd_float3, String) {
        if bossActive && !bossDead {
            if let core = bossCore, core.alive { return (core.position, "WARDEN CORE") }
            if let t = turrets.filter({ $0.alive }).min(by: { simd_distance($0.position, position) < simd_distance($1.position, position) }) {
                return (t.position, "WARDEN")
            }
        }
        if towed != nil { return (dropoff, "FREIGHTER") }
        if let wreck = nearestDisabled(maxDistance: 1400) { return (wreck.position, "BANDIT") }
        if let bandit = enemies.filter({ $0.alive && !$0.disabled && $0.role == .bandit })
            .min(by: { simd_distance($0.position, position) < simd_distance($1.position, position) }) {
            return (bandit.position, "BANDIT")
        }
        if let hostile = nearestHostile() { return (hostile.position, "BOGEY") }
        return (dropoff, "FREIGHTER")
    }

    private func contact(_ point: simd_float3, kind: Int) -> HudContact {
        let rel = point - position
        let fwd = forward()
        let right = simd_normalize(simd_cross(fwd, simd_float3(0, 1, 0)))
        let ahead = simd_dot(rel, fwd)
        let side = simd_dot(rel, right)
        return HudContact(world: point, kind: kind, distance: simd_length(rel), bearing: atan2(side, ahead))
    }

    private func blip(_ point: simd_float3, kind: Int) -> HudBlip {
        let rel = point - position
        let fwd = forward()
        let right = simd_normalize(simd_cross(fwd, simd_float3(0, 1, 0)))
        let ahead = simd_dot(rel, fwd) / 220
        let side = simd_dot(rel, right) / 220
        return HudBlip(x: max(-1, min(1, side)), y: max(-1, min(1, ahead)), kind: kind)
    }

    private func creditsText() -> String {
        """
        NEON RIFT
        by Shahbaz Mirshahi

        NEON RIFT 2
        a test flight

        Bounty \(bounty)
        Rank \(rank)
        \(deliveries) bandits delivered
        \(kills) bogeys down

        Flight, picture, and sound
        Shahbaz Mirshahi

        Ships, sky, and weapons
        built in the engine

        Planet maps
        Solar System Scope, CC BY 4.0

        \(PilotLog.medalLine())

        Thank you for flying the lane

        TAP TO FLY AGAIN
        """
    }

    private func nearestEnemy() -> Enemy? {
        nearestHostile()
    }

    private func lockTarget(cone: Float) -> Enemy? {
        let fwd = forward()
        return enemies.filter { enemy in
            guard enemy.alive, !enemy.disabled else { return false }
            let to = enemy.position - position
            let dist = simd_length(to)
            return dist < 260 && simd_dot(fwd, to / dist) > cone
        }.min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    private func publishHud() {
        var clock = 14 * 3600 + 32 * 60 + 7 + Int(missionTime)
        clock = clock % (24 * 3600)
        hud.phase = phase
        hud.clock = String(format: "%02d:%02d:%02d", clock / 3600, (clock / 60) % 60, clock % 60)
        hud.nav = phase == .warden || phase == .results ? "NAV-07" : "NAV-04"
        hud.speed = String(format: "SPD %.2fc", simd_length(velocity) / 72)
        hud.weapon = Int(weapon.rounded())
        hud.shield = Int(max(0, shield).rounded())
        hud.hull = Int(max(0, hull).rounded())
        var heading = yaw * 180 / .pi
        heading.formTruncatingRemainder(dividingBy: 360)
        if heading < 0 { heading += 360 }
        hud.heading = heading
        updateLock()
        let locked = lockedEnemy
        hud.lockWorld = locked.map { $0.alive ? $0.position : nil } ?? nil
        if let locked, locked.alive {
            let kind: String
            switch locked.role {
            case _ where locked.disabled: kind = "DISABLED"
            case .bandit: kind = "BANDIT"
            case .bogey: kind = "BOGEY"
            case .turret: kind = "TURRET"
            case .core: kind = "WARDEN CORE"
            }
            hud.lockTitle = kind
            hud.lockHealth = locked.hullMax > 1 ? max(0, locked.hull / locked.hullMax) : 0
            hud.lockMissile = missileLevel > 0 && !locked.disabled
        } else {
            hud.lockTitle = ""
            hud.lockHealth = 0
            hud.lockMissile = false
        }
        let tone: Float = (hud.lockMissile && phase == .combat) ? 1 : 0
        audio.setLock(0)  // b17: the Locking Target FX sample replaces the synth lock pulse.
        if tone > 0.5 && !hadLock { haptics.hit() }
        hadLock = tone > 0.5
        hud.pickups = phase == .combat ? pickups.filter(\.alive).map(\.node.simdPosition) : []
        hud.gems = phase == .combat ? pickups.filter(\.alive).map { ($0.node.simdPosition, $0.kind.label) } : []
        hud.objective = objectiveLine()
        hud.callout = callout
        hud.calloutAlpha = max(0, calloutLeft / 1.6)
        hud.bounty = bounty
        hud.rank = rank
        hud.boost = max(0, boostLeft / 1.55)
        hud.towing = towed != nil
        hud.beamReady = nearestDisabled(maxDistance: 140) != nil || towed != nil
        let guide = guidePoint()
        hud.guideWorld = guide.0
        hud.guideTitle = guide.1
        hud.guideDistance = simd_distance(guide.0, position)
        let rel = guide.0 - position
        let fwd = forward()
        let right = safeNorm(simd_cross(fwd, simd_float3(0, 1, 0)))
        hud.guideBearing = atan2(simd_dot(rel, right), simd_dot(rel, fwd))
        hud.cockpit = cockpitOn
        hud.creditScroll = creditScroll
        hud.contacts = []
        hud.blips = []
        if let locked, locked.alive, phase == .combat {
            hud.lockID = locked.id
            hud.lockDistance = simd_distance(locked.position, position)
            hud.lockChosen = chosenEnemy === locked
            hud.lockCritical = locked.critical
        } else {
            hud.lockID = -1
            hud.lockDistance = 0
            hud.lockChosen = false
            hud.lockCritical = false
        }
        hud.lockAge = lockAge
        hud.heat = heat
        hud.overheated = overheated
        hud.overdrive = max(0, overdriveLeft / 8)
        hud.hintWorld = (hintLeft > 0 && hintEnemy?.alive == true && hintEnemy !== lockedEnemy) ? hintEnemy?.position : nil
        if bossActive && !bossDead && phase == .combat {
            if let core = bossCore, core.alive {
                hud.bossTitle = "WARDEN CORE"
                hud.bossHealth = max(0, core.hull / core.hullMax)
            } else {
                hud.bossTitle = "DREADNOUGHT WARDEN"
                let left = turrets.reduce(Float(0)) { $0 + ($1.alive ? max(0, $1.hull) : 0) }
                hud.bossHealth = 0.5 + 0.5 * left / Float(max(1, turrets.count) * 160)
            }
        } else {
            hud.bossTitle = ""
            hud.bossHealth = 0
        }
        hud.viewName = viewMode == 0 ? "CHASE" : (viewMode == 1 ? "AERIAL" : "COCKPIT")
        hud.trickShot = max(0, trickShotFlash / 0.5)
        if phase == .combat {
            for enemy in enemies where enemy.alive {
                let kind = enemy.disabled ? 2 : (enemy.role == .bandit ? 1 : 0)
                var c = contact(enemy.position, kind: kind)
                c.id = enemy.id
                c.health = enemy.hullMax > 1 ? max(0, enemy.hull / enemy.hullMax) : 1
                hud.contacts.append(c)
                var b = blip(enemy.position, kind: kind)
                b.id = enemy.id
                hud.blips.append(b)
            }
            hud.blips.append(blip(dropoff, kind: 3))
        }
        hud.popups = popups.map { ($0.position, $0.text, $0.age) }
        hud.sunWorld = SpaceLook.sunDirection * 2200
        hud.flash = flash
        hud.kills = kills
        hud.score = score
        hud.showResults = phase == .results
        if phase == .results {
            let seconds = Int(missionTime)
            let time = String(format: "%d:%02d", seconds / 60, seconds % 60)
            if died {
                hud.resultsBody = "SHIP LOST\n\(time) IN THE LANE\nBOUNTY \(bounty)"
            } else {
                hud.resultsBody = (bossOutcome.isEmpty ? "" : bossOutcome + "\n") + "BOUNTY \(bounty)\n\(deliveries) BANDITS DELIVERED\n\(kills) BOGEYS DOWN\n\(time) IN THE LANE\nRANK \(rank)"
            }
            hud.credits = creditsText()
        }
        let beat = Int(missionTime)
        if beat != lastBeat && beat > 0 && beat % 2 == 0 {
            lastBeat = beat
            logMark("NR2 beat \(phase.rawValue) \(String(format: "%.1f", phaseTime))")
        }
    }

    private func watchFPS(_ raw: Float) {
        guard !showcase, profile.high, !degraded else { return }
        fpsWindow += raw
        fpsFrames += 1
        if fpsWindow > 1.3 {
            let fps = Float(fpsFrames) / fpsWindow
            lowStrikes = fps < 52 ? lowStrikes + 1 : 0
            if lowStrikes >= 2 { degrade() }
            fpsWindow = 0
            fpsFrames = 0
        }
    }

    private func enter(_ next: FlightPhase) {
        phase = next
        phaseTime = 0
        hud.phase = next
        logMark("NR2 phase \(next.rawValue)")
        switch next {
        case .cinema:
            break
        case .combat:
            hangar.removeFromParentNode()
            if viewMode == 2 { ensureCockpit() }
            cockpitOn = viewMode == 2
            refreshCockpitVisibility()
            if !trickHinted && !showcase {
                trickHinted = true
                UserDefaults.standard.set(true, forKey: "nr2.trickHint")
                callout = "TWO-FINGER SWIPE  ← → ROLL   ↑ ↓ LOOP"
                calloutLeft = 4
            }
        case .warden:
            cockpitOn = false
            refreshCockpitVisibility()
            player.isHidden = false
            spawnWarden()
        case .results:
            cockpitOn = false
            cockpit.isHidden = true
            player.isHidden = false
            audio.setThrust(0.05)
            audio.setLock(0)
            if !loggedSortie {
                loggedSortie = true
                let fresh = PilotLog.commit(kills: kills, deliveries: deliveries, bounty: bounty, streak: bestStreak)
                if !fresh.isEmpty { say("MEDAL  " + fresh.joined(separator: "  ")) }
            }
            audio.setMusic(0.15)
            audio.setBeam(0)
        }
    }

    private func spawnWarden() {
        guard dreadnought == nil else { return }
        let ship = Meshes.dreadnought(art: art)
        ship.simdPosition = simd_float3(0, 8, -1120)
        scene.rootNode.addChildNode(ship)
        dreadnought = ship
        let lamp = SCNNode()
        lamp.light = SCNLight()
        lamp.light?.type = .omni
        lamp.light?.color = UIColor(red: 1, green: 0.35, blue: 0.08, alpha: 1)
        lamp.light?.intensity = 800
        lamp.light?.attenuationEndDistance = 220
        lamp.simdPosition = simd_float3(0, 10, -860)
        scene.rootNode.addChildNode(lamp)
        wardenLight = lamp
    }

    private func buildScene() {
        scene.background.contents = art.sky
        scene.lightingEnvironment.contents = art.sky
        scene.lightingEnvironment.intensity = 0.48
        scene.physicsWorld.gravity = SCNVector3Zero

        camera.wantsHDR = true
        camera.wantsExposureAdaptation = false
        camera.exposureOffset = 0.22
        camera.bloomIntensity = min(profile.bloom, 0.5)
        camera.bloomThreshold = 0.78
        camera.bloomBlurRadius = 8
        camera.saturation = 0.92
        camera.contrast = 1.12
        camera.vignettingIntensity = 0.32
        camera.vignettingPower = 1.2
        camera.colorFringeStrength = 0.18
        camera.colorFringeIntensity = 0.08
        camera.motionBlurIntensity = 0
        camera.zNear = 0.05
        camera.zFar = 8000
        camera.fieldOfView = verticalFieldOfView(boost: 0, shake: 0)
        camera.wantsDepthOfField = false
        camera.fStop = 4
        camera.focusDistance = 24
        camera.focalBlurSampleCount = 4
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)

        let sun = SCNNode()
        sun.light = SCNLight()
        sun.light?.type = .directional
        sun.light?.intensity = 1900
        sun.light?.temperature = 5800
        sun.light?.color = UIColor(red: 1, green: 0.96, blue: 0.9, alpha: 1)
        sun.light?.castsShadow = profile.high
        if profile.high {
            sun.light?.shadowMode = .deferred
            sun.light?.shadowMapSize = CGSize(width: 1024, height: 1024)
            sun.light?.shadowSampleCount = 8
            sun.light?.maximumShadowDistance = 380
            sun.light?.shadowColor = UIColor(white: 0, alpha: 0.62)
        }
        sun.simdPosition = SpaceLook.sunDirection * 200
        sun.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(sun)

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .directional
        fill.light?.intensity = 36
        fill.light?.color = UIColor(red: 0.55, green: 0.62, blue: 0.72, alpha: 1)
        fill.simdPosition = simd_float3(200, -40, 80)
        fill.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(fill)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 8
        ambient.light?.color = UIColor(white: 0.7, alpha: 1)
        scene.rootNode.addChildNode(ambient)

        flashLight.light = SCNLight()
        flashLight.light?.type = .omni
        flashLight.light?.intensity = 0
        flashLight.light?.color = UIColor(red: 1, green: 0.6, blue: 0.3, alpha: 1)
        flashLight.light?.attenuationEndDistance = 90
        scene.rootNode.addChildNode(flashLight)

        engineLight.light = SCNLight()
        engineLight.light?.type = .omni
        engineLight.light?.color = UIColor(red: 0.3, green: 0.9, blue: 1, alpha: 1)
        engineLight.light?.intensity = 0
        engineLight.light?.attenuationStartDistance = 0.4
        engineLight.light?.attenuationEndDistance = 18
        scene.rootNode.addChildNode(engineLight)

        let ship = Meshes.fighter(art: art)
        ShipLivery.current.apply(to: ship, art: art)
        player.addChildNode(ship)
        scene.rootNode.addChildNode(player)
        placePlayer()

        hangar = Meshes.hangar(art: art)
        scene.rootNode.addChildNode(hangar)

        rift = Meshes.rift(art: art, radius: 120)
        rift.simdPosition = simd_float3(0, 18, -900)
        scene.rootNode.addChildNode(rift)

        scene.rootNode.addChildNode(Meshes.planet(art: art))
        scene.rootNode.addChildNode(Meshes.world("moon", radius: 70, at: simd_float3(180, 40, -520), air: UIColor(white: 0.75, alpha: 1)))
        scene.rootNode.addChildNode(Meshes.world("mars", radius: 140, at: simd_float3(-420, 80, -980), air: UIColor(red: 0.85, green: 0.45, blue: 0.28, alpha: 1)))
        scene.rootNode.addChildNode(Meshes.world("earth", radius: 90, at: simd_float3(-260, 30, -640), air: UIColor(red: 0.45, green: 0.7, blue: 1, alpha: 1)))
        scene.rootNode.addChildNode(Meshes.sun(art: art))
        let freighter = Meshes.freighter(art: art)
        freighter.simdPosition = dropoff
        scene.rootNode.addChildNode(freighter)
        let beamMat = SCNMaterial()
        beamMat.lightingModel = .constant
        beamMat.diffuse.contents = UIColor(red: 0.45, green: 0.95, blue: 1, alpha: 1)
        beamMat.emission.contents = UIColor(red: 0.45, green: 0.95, blue: 1, alpha: 1)
        beamMat.emission.intensity = 1.4
        let beam = SCNCylinder(radius: 0.42, height: 1)
        beam.materials = [beamMat]
        beamNode.geometry = beam
        let glowMat = SCNMaterial()
        glowMat.lightingModel = .constant
        glowMat.diffuse.contents = UIColor(red: 0.5, green: 0.9, blue: 1, alpha: 1)
        glowMat.emission.contents = UIColor(red: 0.5, green: 0.9, blue: 1, alpha: 1)
        glowMat.transparency = 0.28
        glowMat.blendMode = .add
        glowMat.writesToDepthBuffer = false
        let glow = SCNCylinder(radius: 1.15, height: 1)
        glow.materials = [glowMat]
        beamNode.addChildNode(SCNNode(geometry: glow))
        beamNode.isHidden = true
        scene.rootNode.addChildNode(beamNode)

        if !showcase {
            let spots: [simd_float3] = [
                simd_float3(28, 6, -90),
                simd_float3(-36, 8, -210),
                simd_float3(22, 5, -340),
                simd_float3(-18, 9, -470),
            ]
            for spot in spots {
                let node = Meshes.pickup(art: art)
                node.simdPosition = spot
                adornPickup(node)
                scene.rootNode.addChildNode(node)
                let kinds: [PrizeKind] = [.shield, .repair, .spread, .missile]
                let crate = Pickup(node: node, kind: kinds[pickups.count % kinds.count])
                crate.opened = false
                addCrate(crate)
                pickups.append(crate)
            }
            // b18: extra lane crates.
            for i in 0..<6 {
                let lane = Float(i)
                let spot = simd_float3(sin(lane * 2.3) * 34, 6 + cos(lane * 1.3) * 4, -130 - lane * 70)
                let node = Meshes.pickup(art: art)
                node.simdPosition = spot
                adornPickup(node)
                scene.rootNode.addChildNode(node)
                let kinds: [PrizeKind] = [.credits, .multi, .shield, .credits, .spread, .repair]
                let crate = Pickup(node: node, kind: kinds[i])
                crate.opened = false
                addCrate(crate)
                pickups.append(crate)
            }
        }

        let rocks = profile.high ? 18 : 8
        for rock in 0..<rocks {
            let s = CGFloat(2.2 + Float(rock % 5) * 1.3)
            let box = SCNBox(width: s, height: s * 0.72, length: s * 1.25, chamferRadius: 0.25)
            box.materials = [art.debris]
            let node = SCNNode(geometry: box)
            let lane = Float(rock)
            node.simdPosition = simd_float3(
                sin(lane * 1.7) * (28 + lane * 3.2),
                4 + cos(lane * 0.9) * 8,
                -40 - lane * 22
            )
            node.eulerAngles = SCNVector3(lane * 0.4, lane * 0.2, lane * 0.15)
            scene.rootNode.addChildNode(node)
            self.rocks.append(Rock(node: node, position: node.simdPosition, radius: Float(s) * 0.7, hp: 30 + Float(s) * 10))
        }
    }
}

private enum ShipRole {
    case bandit, bogey, turret, core
}

private enum Trick {
    case loop, roll
}

private enum PrizeKind: Int {
    case shield, repair, spread, missile, credits, multi

    var label: String {
        switch self {
        case .shield: return "SHIELD"
        case .repair: return "REPAIR"
        case .spread: return "SPREAD"
        case .missile: return "MISSILES"
        case .credits: return "CREDITS"
        case .multi: return "PAY"
        }
    }
}

private final class Enemy {
    let node: SCNNode
    let role: ShipRole
    var position: simd_float3
    var velocity = simd_float3.zero
    var hull: Float
    var hullMax: Float = 1
    var cooldown: Float
    var age: Float = 0
    var strafe: Float = 1
    var seed: Float = Float.random(in: 0...6)
    var alive = true
    var disabled = false
    var id = 0
    var radius: Float = 3.6
    var wire: SCNMaterial?
    var baseColor: UIColor = .white
    var flashT: Float = 0
    var critical = false
    var jitter = simd_float3.zero
    var smokeClock: Float = 0
    var volleys = 0
    var local = simd_float3.zero
    init(node: SCNNode, position: simd_float3, hull: Float, cooldown: Float, role: ShipRole) {
        self.node = node
        self.position = position
        self.hull = hull
        self.cooldown = cooldown
        self.role = role
        self.strafe = Bool.random() ? 1 : -1
    }
}

private final class Bolt {
    let node: SCNNode
    var position: simd_float3
    var direction: simd_float3
    var speed: Float
    var life: Float
    var age: Float = 0
    var fromPlayer: Bool
    var home: Enemy?
    var alive = true
    var missile = false
    var trick = false
    var spin: Float = 0
    var damage: Float = 16
    init(node: SCNNode, position: simd_float3, direction: simd_float3, speed: Float, life: Float, fromPlayer: Bool, home: Enemy?) {
        self.node = node
        self.position = position
        self.direction = direction
        self.speed = speed
        self.life = life
        self.fromPlayer = fromPlayer
        self.home = home
    }
}

private final class Pickup {
    let node: SCNNode
    let kind: PrizeKind
    var alive = true
    var opened = true
    init(node: SCNNode, kind: PrizeKind) {
        self.node = node
        self.kind = kind
    }
}

private struct Debris {
    let node: SCNNode
    let born: Float
}

private final class Effect {
    let node: SCNNode
    var age: Float = 0
    var life: Float
    var start: Float
    var end: Float
    var spark: Bool
    var velocity: simd_float3
    var spin = simd_float3.zero
    var trail: Float = 0
    var trailClock: Float = 0
    var solid = false
    init(node: SCNNode, life: Float, start: Float, end: Float, spark: Bool, velocity: simd_float3) {
        self.node = node
        self.life = life
        self.start = start
        self.end = end
        self.spark = spark
        self.velocity = velocity
    }
}

private final class Dying {
    let node: SCNNode
    var position: simd_float3
    var velocity: simd_float3
    var age: Float
    var big: Bool
    var done = false
    init(node: SCNNode, position: simd_float3, velocity: simd_float3, age: Float, big: Bool) {
        self.node = node
        self.position = position
        self.velocity = velocity
        self.age = age
        self.big = big
    }
}

private final class Rock {
    let node: SCNNode
    let position: simd_float3
    let radius: Float
    var hp: Float
    var alive = true
    init(node: SCNNode, position: simd_float3, radius: Float, hp: Float) {
        self.node = node
        self.position = position
        self.radius = radius
        self.hp = hp
    }
}

private struct Popup {
    var position: simd_float3
    var text: String
    var age: Float
}

private func lookOrientation(forward: simd_float3, up: simd_float3, roll: Float) -> simd_quatf {
    let f = safeNorm(forward)
    let z = -f
    var x = simd_cross(up, z)
    if simd_length(x) < 1e-4 {
        x = simd_cross(simd_float3(1, 0, 0), z)
    }
    x = simd_normalize(x)
    let y = simd_normalize(simd_cross(z, x))
    let q = simd_quatf(simd_float3x3(columns: (x, y, z)))
    if abs(roll) < 1e-4 { return simd_normalize(q) }
    return simd_normalize(simd_quatf(angle: roll, axis: f) * q)
}

private func safeNorm(_ v: simd_float3) -> simd_float3 {
    let len = simd_length(v)
    if len < 1e-5 { return simd_float3(0, 0, -1) }
    return v / len
}

private func mix(_ a: Float, _ b: Float, _ t: Float) -> Float { a + (b - a) * t }

private func segmentHits(_ a: simd_float3, _ b: simd_float3, _ center: simd_float3, radius: Float) -> Bool {
    let ab = b - a
    let len2 = simd_length_squared(ab)
    if len2 < 1e-6 { return simd_distance(a, center) < radius }
    let t = max(0, min(1, simd_dot(center - a, ab) / len2))
    let closest = a + ab * t
    return simd_distance(closest, center) < radius
}

private func logMark(_ text: String) {
    NSLog("%@", text)
    print(text)
    fflush(stdout)
}
