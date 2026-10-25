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
    var threats: [HudThreat] = []
    var gunName = "PULSE"
    var underFire = false
    var lockAttacking = false
    var lessonDone = false
}

struct HudThreat {
    var world: simd_float3
    var bearing: Float
    var hit: Bool
}

struct HudContact {
    var world: simd_float3
    var kind: Int
    var distance: Float
    var bearing: Float
}

struct HudBlip {
    var x: Float
    var y: Float
    var kind: Int
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
    private var spreadLevel = 0
    private var missileLevel = 0
    private var gun: Gun = .pulse
    private var arcRank = 0
    private var beamRank = 0
    private var phaserRank = 0
    private var incoming: [IncomingHit] = []
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
    private let guideColumn = SCNNode()
    private let guideLight = SCNNode()
    private let captureGoal: Int
    private let lessonGoal = 3
    private var fightCenter = simd_float3.zero
    private var raidWave = 0
    private var lessonSpawned = 0
    private var lessonKills = 0
    private var bossSpawned = false
    private var bossDead = false
    private var victoryLeft: Float = -1
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
            captureGoal = 1
            hull = 240
            shield = 200
        } else {
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
        let sim = raw * (slowmo > 0 ? 0.42 : 1)

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
            } else if phaseTime > (showcase ? 42 : 170) {
                enter(.warden)
            }
        case .warden:
            stepFlight(sim * 0.35)
            stepWarden(raw)
            if phaseTime > 6.2 { enter(.results) }
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

    func requestLoop() {
        beginTrick(.loop, direction: 1)
    }

    func requestRoll(direction: Float) {
        beginTrick(.roll, direction: direction)
    }

    func requestFace() {
        lockThreat(near: nil)
    }

    /// Turns onto the ship that is shooting, and locks it. A tapped indicator
    /// passes that ship's position. With no one firing, it locks the nearest hostile.
    func lockThreat(near world: simd_float3?) {
        guard phase == .combat, !died else { return }
        let pool = enemies.filter { $0.alive && !$0.disabled }
        let pick: Enemy?
        if let world {
            pick = pool.min { simd_distance($0.position, world) < simd_distance($1.position, world) }
        } else {
            let hot = pool.filter { $0.threat > 0 }
            let list = hot.isEmpty ? pool : hot
            pick = list.min { simd_distance($0.position, position) < simd_distance($1.position, position) }
        }
        guard let pick else { return }
        cycled = pick
        faceLeft = 1.15
        say("LOCK THREAT")
        haptics.hit()
    }

    func cycleGun() {
        guard phase == .combat, !died, !showcase else { return }
        let order: [Gun] = [.pulse, .arc, .beam, .phaser]
        let index = order.firstIndex(of: gun) ?? 0
        gun = order[(index + 1) % order.count]
        say(gun.label)
        haptics.pickup()
    }

    private func beginTrick(_ kind: Trick, direction: Float) {
        guard phase == .combat, !died, trick == nil else { return }
        trick = kind
        trickAge = 0
        trickDir = direction >= 0 ? 1 : -1
        trickPitch0 = pitch
        trickRoll0 = roll
        trickCamYaw = yaw
        say(kind == .loop ? "LOOP" : "BARREL ROLL")
        audio.titleHit()
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
        ensureCockpit()
        cockpitOn.toggle()
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
        let list = enemies.filter { $0.alive }
        guard !list.isEmpty else { return }
        if let current = cycled, let index = list.firstIndex(where: { $0 === current }) {
            cycled = list[(index + 1) % list.count]
        } else {
            cycled = list[0]
        }
        let name = cycled?.boss == true ? "WARDEN" : (cycled?.role == .bandit ? "BANDIT" : "RAIDER")
        say("TARGET \(name)")
    }

    private func stepFlight(_ dt: Float) {
        let auto = showcase && phase == .combat && !died
        var stick = inputStick
        var fire = inputFire
        if auto {
            if let target = nearestHostile() {
                let cross = yawError(toward: target.position)
                stick.x = CGFloat(max(-1, min(1, cross * 2.8)))
                let dist = simd_distance(target.position, position)
                if dist < 34 {
                    stick.y = 0.2
                } else if dist < 70 {
                    stick.y = 0.55
                } else {
                    stick.y = 0.9
                }
                let to = safeNorm(target.position - position)
                fire = simd_dot(forward(), to) > 0.78
            } else if let towed {
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
            } else {
                stick = CGPoint(x: 0, y: 0.35)
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
                pitch = trickPitch0 + u * 2 * .pi
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
            } else if abs(aimY) < 0.08 {
                targetPitch = 0.03
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
            if phase == .combat {
                force.y += (8 - position.y) * mass * 3.2
                if position.y < 3 { force.y += (3 - position.y) * mass * 6 }
                if position.y > 16 { force.y -= (position.y - 16) * mass * 5 }
            } else {
                if position.y < 2 { force.y += (2 - position.y) * mass * 4 }
                if position.y > 28 { force.y -= (position.y - 28) * mass * 3 }
            }
        } else {
            if position.y < -8 { force.y += (-8 - position.y) * mass * 2 }
            if position.y > 46 { force.y -= (position.y - 46) * mass * 2 }
        }
        if phase == .combat {
            let flat = simd_float3(position.x - fightCenter.x, 0, position.z - fightCenter.z)
            let radius = simd_length(flat)
            let limit: Float = 130
            if radius > limit && radius > 0.001 {
                let inward = simd_float3(-flat.x, 0, -flat.z) / radius
                force += inward * (radius - limit) * mass * 8
                let err = yawError(toward: fightCenter)
                yaw += max(-2.2 * dt, min(2.2 * dt, err * 1.4))
            }
        }
        if abs(position.x) > 280 {
            force.x -= (position.x - copysign(280, position.x)) * mass * 1.4
        }
        if position.z > 50 { force.z -= (position.z - 50) * mass }
        if position.z < -640 { force.z -= (position.z + 640) * mass }

        velocity += force / mass * dt
        let cap: Float = boosting ? 158 : (towed != nil ? 78 : 118)
        let speed = simd_length(velocity)
        if speed > cap { velocity *= cap / speed }
        if !speed.isFinite { velocity = .zero }
        position += velocity * dt
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

        if abs(Float(stick.x)) > 0.35 {
            puff(at: Float(stick.x) > 0 ? ShipPoints.wingL : ShipPoints.wingR)
        }

        guard phase == .combat, !died else { return }
        weapon = min(100, weapon + (fire ? 0 : 26) * dt)
        fireClock -= dt
        let active: Gun = showcase ? .pulse : gun
        let wantFire = fire && weapon > 4
        if wantFire && fireClock <= 0 {
            let cost: Float
            let gap: Float
            switch active {
            case .pulse:
                cost = 5
                gap = showcase ? 0.16 : 0.13
            case .arc:
                cost = 7
                gap = 0.2
            case .beam:
                cost = 9
                gap = 0.24
            case .phaser:
                cost = 16
                gap = 0.55
            }
            weapon = max(0, weapon - cost)
            fireClock = gap
            shootPlayer(active)
        }
    }

    private func stepCombat(_ dt: Float) {
        for enemy in enemies where enemy.threat > 0 {
            enemy.threat -= dt
            if enemy.threat <= 0 {
                enemy.threat = 0
                paintCage(enemy, attacking: false)
            }
        }
        stepRaid(dt)
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
            if reach < 96 && reach > 0.5 {
                let pull = min(reach, (110 - reach) * 2.2 * dt + 22 * dt)
                gem += safeNorm(offset) * pull
                pickup.node.simdPosition = gem
            }
            if simd_distance(gem, position) < 28 {
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
        if dist > 42 { accel += dir * (enemy.boss ? 54 : 78) }
        else if dist < 22 { accel -= dir * 42 }
        else { accel += dir * 10 }
        let side = safeNorm(simd_cross(dir, simd_float3(0, 1, 0)))
        accel += side * enemy.strafe * (enemy.boss ? 10 : 22)
        if enemy.age > (enemy.boss ? 2.4 : 1.6) {
            enemy.age = 0
            enemy.strafe = -enemy.strafe
        }
        let wantY: Float = 8 + sin(enemy.seed + missionTime * 0.8) * 1.6
        accel.y += (wantY - enemy.position.y) * 3.5
        enemy.velocity += accel * dt
        let cap: Float = enemy.boss ? 48 : 72
        let sp = simd_length(enemy.velocity)
        if sp > cap { enemy.velocity *= cap / sp }
        enemy.position += enemy.velocity * dt
        let face = safeNorm(enemy.velocity + dir * 8)
        enemy.node.simdOrientation = lookOrientation(forward: face, up: simd_float3(0, 1, 0), roll: enemy.strafe * 0.4)
        enemy.node.simdPosition = enemy.position
        if let chip = enemy.node.childNode(withName: "chip", recursively: false) {
            chip.eulerAngles.x += dt * 4
            chip.eulerAngles.y += dt * 3
        }
        if let smoke = enemy.node.childNode(withName: "smoke", recursively: false) {
            smoke.opacity = CGFloat(0.55 + 0.35 * abs(sin(missionTime * 6 + enemy.seed)))
        }

        enemy.cooldown -= dt
        let aim = position + velocity * min(dist / 150, 0.45) - enemy.position
        if dist < 96 && enemy.cooldown <= 0 && simd_dot(face, safeNorm(aim)) > 0.8 && !died {
            enemy.cooldown = enemy.boss ? 1.15 : (showcase ? 1.7 : 1.15)
            shootEnemy(enemy, toward: safeNorm(aim))
        }
        if dist < 8 && hurt <= 0 && !died {
            hurtPlayer(36, from: enemy.position)
            destroy(enemy)
        }
    }

    private func stepWarden(_ raw: Float) {
        guard let ship = dreadnought else { return }
        let u = smoothstep(0.3, 5.2, phaseTime)
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
            if let target = bolt.home, target.alive {
                let to = safeNorm(target.position - bolt.position)
                if simd_dot(bolt.direction, to) > 0.4 {
                    let k = 1 - exp(-4.2 * dt)
                    bolt.direction = safeNorm(bolt.direction * (1 - k) + to * k)
                }
            }
            let next = bolt.position + bolt.direction * bolt.speed * dt
            if bolt.fromPlayer {
                for enemy in enemies where enemy.alive && !enemy.disabled {
                    let radius: Float = enemy.boss ? 7.2 : 3.8
                    if segmentHits(bolt.position, next, enemy.position, radius: radius) {
                        bolt.alive = false
                        let amount = bolt.damage ?? (bolt.missile ? (showcase ? 48 : 40) : (showcase ? 30 : 18))
                        bite(enemy, amount)
                        break
                    }
                }
            } else if !died && hurt <= 0 {
                if segmentHits(bolt.position, next, position, radius: 2.3) {
                    bolt.alive = false
                    let from = bolt.shooter?.position ?? bolt.position
                    if let shooter = bolt.shooter, shooter.alive {
                        shooter.threat = max(shooter.threat, 2.2)
                    }
                    hurtPlayer(16, from: from)
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
            explode(at: boom.0, power: boom.1, chain: false)
        }
        for effect in effects {
            effect.age += dt
            let u = min(1, effect.age / effect.life)
            effect.node.opacity = CGFloat(1 - u)
            let s = effect.start + (effect.end - effect.start) * u
            effect.node.simdScale = simd_float3(s, s, s)
            if effect.spark {
                effect.node.simdPosition += effect.velocity * dt
            }
        }
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
        popups.removeAll { $0.age > 0.95 }
        for index in incoming.indices { incoming[index].life -= dt }
        incoming.removeAll { $0.life <= 0 }
        flash = max(0, flash - dt * 2.4)
        shake = max(0, shake - dt * 1.6)
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
        return base + CGFloat(boost) * boostGain + CGFloat(shake) * 2
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
        let chasePos = position - fwd * 13.5 + simd_float3(0, 2.2, 0)
        let chaseLook = position + fwd * 28 + simd_float3(0, 1.8, 0)
        var desired = chasePos
        var look = chaseLook
        var rollCam = roll * 0.38

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
            let back = simd_float3(sin(trickCamYaw), 0, -cos(trickCamYaw))
            let right = simd_float3(cos(trickCamYaw), 0, sin(trickCamYaw))
            let duration: Float = trick == .loop ? 1.25 : 0.72
            let u = min(1, trickAge / duration)
            desired = position - back * 20 + simd_float3(0, 5.5, 0)
            if trick == .roll {
                desired += right * sin(u * .pi) * 12 * trickDir
                rollCam = sin(u * .pi) * trickDir * 0.45
            } else {
                desired += right * sin(u * 2 * .pi) * 5 + simd_float3(0, sin(u * .pi) * 7, 0)
                rollCam = sin(u * 2 * .pi) * 0.2
            }
            look = position + simd_float3(0, 0.8, 0)
        }

        let kPos = 1 - exp(-4.2 * raw)
        let kLook = 1 - exp(-6.5 * raw)
        if !camReady {
            camPos = desired
            camLook = look
            camReady = true
        } else {
            camPos = mix3(camPos, desired, kPos)
            camLook = mix3(camLook, look, kLook)
        }
        let t = missionTime
        let jitter = simd_float3(sin(t * 41), cos(t * 37), sin(t * 23) * 0.3) * shake * 0.45
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
            hud.letterbox = 0
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

    private func shootPlayer(_ active: Gun) {
        switch active {
        case .pulse:
            shootPulse()
        case .arc:
            shootArc()
        case .beam:
            shootBeam()
        case .phaser:
            shootPhaser()
        }
        if missileLevel > 0 && missileClock <= 0, let hard = aimEnemy() {
            missileClock = 1.35
            let origin = worldPoint(simd_float3(0, -0.2, -1)) + forward() * 2
            spawnBolt(origin: origin, direction: safeNorm(hard.position - origin), speed: 90, life: 3.2, player: true, home: hard, mat: art.orangeGlow, missile: true)
        } else {
            missileClock = max(0, missileClock - 0.13)
        }
        audio.shot(active.rawValue)
        haptics.shot(active.rawValue)
        let kick: Float
        switch active {
        case .pulse: kick = 0.035
        case .arc: kick = 0.05
        case .beam: kick = 0.03
        case .phaser: kick = 0.16
        }
        if shake < 0.5 { shake = min(0.5, shake + kick) }
        if active == .phaser { flash = max(flash, 0.18) }
    }

    private func shootPulse() {
        let hard = aimEnemy()
        var dirs = [forward()]
        if spreadLevel > 0 {
            let yawL = yaw - 0.08
            let yawR = yaw + 0.08
            dirs.append(simd_normalize(simd_float3(sin(yawL) * cos(pitch), sin(pitch), -cos(yawL) * cos(pitch))))
            dirs.append(simd_normalize(simd_float3(sin(yawR) * cos(pitch), sin(pitch), -cos(yawR) * cos(pitch))))
        }
        for dir0 in dirs {
            for local in [ShipPoints.gunL, ShipPoints.gunR] {
                let origin = worldPoint(local) + forward() * 1.2
                var dir = dir0
                if let hard {
                    let to = safeNorm(hard.position - origin)
                    dir = safeNorm(dir * 0.32 + to * 0.68)
                }
                spawnBolt(origin: origin, direction: dir, speed: 250, life: 1.15, player: true, home: hard, mat: art.boltPlayer, missile: false, damage: showcase ? 20 : nil)
            }
        }
    }

    private func shootArc() {
        let origin = worldPoint(simd_float3(0, 0.15, -1.2)) + forward() * 1.4
        let aim = aimedDirection(from: origin)
        let reach: Float = 28 + Float(arcRank) * 6
        var end = origin + aim * reach
        var primary: Enemy?
        if let hard = aimEnemy(), simd_distance(hard.position, origin) < reach + 8 {
            primary = hard
            end = hard.position
        }
        spawnArc(from: origin, to: end)
        if let primary {
            bite(primary, showcase ? 22 : 16 + Float(arcRank) * 4)
            if arcRank > 0 {
                let next = enemies.filter { $0.alive && !$0.disabled && $0 !== primary && simd_distance($0.position, primary.position) < 18 }
                    .min { simd_distance($0.position, primary.position) < simd_distance($1.position, primary.position) }
                if let next {
                    spawnArc(from: primary.position, to: next.position)
                    bite(next, 10)
                }
            }
        } else {
            spawnBolt(origin: origin, direction: aim, speed: 280, life: 0.16, player: true, home: nil, mat: art.arcGlow, missile: false, damage: 14, length: 2.2, thick: 0.08)
        }
    }

    private func shootBeam() {
        let origin = worldPoint(simd_float3(0, 0.05, -1.4)) + forward() * 1.6
        let aim = aimedDirection(from: origin)
        let reach: Float = 40 + Float(beamRank) * 8
        let end = origin + aim * reach
        let cyl = SCNCylinder(radius: 0.06, height: CGFloat(reach))
        cyl.materials = [art.beamGlow]
        let node = SCNNode(geometry: cyl)
        node.simdPosition = (origin + end) * 0.5
        node.simdOrientation = beamOrientation(aim)
        let glow = SCNCylinder(radius: 0.2, height: CGFloat(reach))
        glow.materials = [art.beamGlow]
        let halo = SCNNode(geometry: glow)
        halo.opacity = 0.35
        node.addChildNode(halo)
        scene.rootNode.addChildNode(node)
        effects.append(Effect(node: node, life: 0.09, start: 1, end: 1, spark: false, velocity: .zero))
        var best: (Enemy, Float)?
        for enemy in enemies where enemy.alive && !enemy.disabled {
            let rel = enemy.position - origin
            let along = simd_dot(rel, aim)
            if along < 2 || along > reach { continue }
            let lateral = simd_length(rel - aim * along)
            if lateral < 2.2, best == nil || along < best!.1 {
                best = (enemy, along)
            }
        }
        if let enemy = best?.0 {
            bite(enemy, (showcase ? 30 : 26) + Float(beamRank) * 6)
            billboard(art.fire, at: enemy.position, life: 0.1, start: 0.2, end: 1.1)
        }
    }

    private func shootPhaser() {
        let origin = worldPoint(simd_float3(0, 0, -1.2)) + forward() * 2
        let aim = aimedDirection(from: origin)
        let hard = aimEnemy()
        spawnBolt(
            origin: origin,
            direction: aim,
            speed: 190,
            life: 1.5,
            player: true,
            home: hard,
            mat: art.phaserGlow,
            missile: false,
            damage: (showcase ? 36 : 34) + Float(phaserRank) * 8,
            length: 9.5,
            thick: 0.34
        )
    }

    private func aimedDirection(from origin: simd_float3) -> simd_float3 {
        var dir = forward()
        if let hard = aimEnemy() {
            let to = safeNorm(hard.position - origin)
            dir = safeNorm(dir * 0.32 + to * 0.68)
        }
        return dir
    }

    private func spawnArc(from origin: simd_float3, to end: simd_float3) {
        let root = SCNNode()
        let steps = 6
        var prev = origin
        for step in 1...steps {
            let u = Float(step) / Float(steps)
            var point = origin + (end - origin) * u
            if step < steps {
                point += simd_float3(Float.random(in: -0.9...0.9), Float.random(in: -0.7...0.7), Float.random(in: -0.9...0.9))
            }
            let span = max(0.2, simd_distance(prev, point))
            let box = SCNBox(width: 0.07, height: 0.07, length: CGFloat(span), chamferRadius: 0)
            box.materials = [art.arcGlow]
            let seg = SCNNode(geometry: box)
            seg.simdPosition = (prev + point) * 0.5
            seg.simdOrientation = lookOrientation(forward: safeNorm(point - prev), up: simd_float3(0, 1, 0), roll: 0)
            root.addChildNode(seg)
            prev = point
        }
        scene.rootNode.addChildNode(root)
        effects.append(Effect(node: root, life: 0.14, start: 1, end: 1, spark: false, velocity: .zero))
    }

    private func shootEnemy(_ enemy: Enemy, toward: simd_float3) {
        if enemy.threat <= 0 {
            paintCage(enemy, attacking: true)
            popups.append(Popup(position: enemy.position + simd_float3(0, 2.2, 0), text: "ATTACKING", age: 0))
            if calloutLeft < 0.25 { say("UNDER FIRE") }
        }
        enemy.threat = 2.7
        let origin = enemy.position + toward * 3
        spawnBolt(origin: origin, direction: toward, speed: 125, life: 2.4, player: false, home: nil, mat: art.boltEnemy, missile: false, shooter: enemy)
    }

    private func paintCage(_ enemy: Enemy, attacking: Bool) {
        guard let cage = enemy.node.childNode(withName: "cage", recursively: false),
              let material = cage.geometry?.firstMaterial else { return }
        let color: UIColor = attacking
            ? UIColor(red: 1, green: 0.04, blue: 0.02, alpha: 1)
            : (enemy.role == .bandit
                ? UIColor(red: 1, green: 0.72, blue: 0.22, alpha: 1)
                : UIColor(red: 1, green: 0.2, blue: 0.1, alpha: 1))
        material.diffuse.contents = color
        material.emission.contents = color
    }

    private func spawnBolt(
        origin: simd_float3,
        direction: simd_float3,
        speed: Float,
        life: Float,
        player: Bool,
        home: Enemy?,
        mat: SCNMaterial,
        missile: Bool,
        damage: Float? = nil,
        shooter: Enemy? = nil,
        length: CGFloat? = nil,
        thick: CGFloat? = nil
    ) {
        let boltLength = length ?? (missile ? 6.4 : (player ? 4.8 : 3.2))
        let width = thick ?? (missile ? 0.28 : 0.14)
        let box = SCNBox(width: width, height: width, length: boltLength, chamferRadius: 0)
        box.materials = [mat]
        let node = SCNNode(geometry: box)
        node.simdPosition = origin
        node.simdOrientation = lookOrientation(forward: direction, up: simd_float3(0, 1, 0), roll: 0)
        scene.rootNode.addChildNode(node)
        let bolt = Bolt(node: node, position: origin, direction: direction, speed: speed, life: life, fromPlayer: player, home: home)
        bolt.missile = missile
        bolt.damage = damage
        bolt.shooter = shooter
        bolts.append(bolt)
    }

    private func livingRaiders() -> [Enemy] {
        enemies.filter { $0.alive && !$0.disabled && !$0.boss }
    }

    private func beginRaid() {
        fightCenter = position
        raidWave = 1
        lessonSpawned = 0
        lessonKills = 0
        bossSpawned = false
        bossDead = false
        victoryLeft = -1
        if showcase {
            spawnWave(count: 3, distance: 36)
        } else {
            spawnRaider(distance: 42, lateral: 0, boss: false)
        }
    }

    private func stepRaid(_ dt: Float) {
        if bossDead {
            if victoryLeft < 0 { victoryLeft = 0.85 }
            victoryLeft -= dt
            if victoryLeft <= 0 { enter(.warden) }
            updateGuideColumn()
            return
        }
        let alive = livingRaiders()
        if showcase && phaseTime > 14 && kills < 1, let first = alive.first {
            bite(first, 800)
        }
        if showcase && phaseTime > 24 && !bossSpawned {
            for enemy in alive { destroy(enemy) }
            spawnBoss()
        }
        if showcase && phaseTime > 34, let boss = enemies.first(where: { $0.boss && $0.alive }) {
            destroy(boss)
        }
        if !bossSpawned && !bossDead {
            if showcase {
                if lessonKills >= lessonGoal && alive.isEmpty {
                    if raidWave < 2 {
                        raidWave = 2
                        spawnWave(count: 3, distance: 34)
                    } else {
                        spawnBoss()
                    }
                }
            } else if lessonKills < lessonGoal {
                if alive.isEmpty && lessonSpawned < lessonGoal {
                    let side: Float = lessonSpawned % 2 == 0 ? -4 : 5
                    spawnRaider(distance: 40, lateral: side, boss: false)
                }
            } else if alive.isEmpty {
                if raidWave < 3 {
                    raidWave += 1
                    spawnWave(count: raidWave == 2 ? 4 : 5, distance: 40)
                } else {
                    spawnBoss()
                }
            }
        }
        updateGuideColumn()
    }

    private func spawnWave(count: Int, distance: Float) {
        guard count > 0 else { return }
        let span = Float(count - 1)
        let gap: Float = showcase ? 5.5 : 12
        for index in 0..<count {
            let lateral = (Float(index) - span * 0.5) * gap
            let dist = distance + Float(index % 2) * 4
            spawnRaider(distance: dist, lateral: lateral, boss: false)
        }
    }

    private func spawnRaider(distance: Float, lateral: Float, boss: Bool) {
        let fwd = forward()
        let right = safeNorm(simd_cross(fwd, simd_float3(0, 1, 0)))
        let lift: Float = boss ? 1.4 : Float(lessonSpawned % 3) * 0.35
        let point = position + fwd * distance + right * lateral + simd_float3(0, lift, 0)
        let hull: Float
        let scale: Float
        if boss {
            hull = showcase ? 1400 : 480
            scale = 2.15
        } else {
            hull = showcase ? 260 : 96
            scale = 1
        }
        spawnEnemy(at: point, role: .bogey, hullOverride: hull, scale: scale, boss: boss)
        if !boss { lessonSpawned += 1 }
    }

    private func spawnBoss() {
        guard !bossSpawned else { return }
        bossSpawned = true
        raidWave = 4
        spawnRaider(distance: showcase ? 40 : 48, lateral: 0, boss: true)
        say("WARDEN")
    }

    private func updateGuideColumn() {
        let hostile = enemies.filter { $0.alive && !$0.disabled }.min {
            simd_distance($0.position, position) < simd_distance($1.position, position)
        }
        guard phase == .combat, let hostile else {
            guideColumn.isHidden = true
            guideLight.isHidden = true
            return
        }
        guideColumn.isHidden = false
        guideLight.isHidden = false
        let base = hostile.position
        guideColumn.simdPosition = simd_float3(base.x, base.y + 22, base.z)
        guideLight.simdPosition = base + simd_float3(0, 4, 0)
        let pulse = 0.45 + 0.55 * abs(sin(missionTime * 5))
        guideColumn.opacity = CGFloat(0.4 + 0.6 * pulse)
        guideLight.light?.intensity = CGFloat(800 + 1400 * pulse)
    }

    private func spawnEnemy(at point: simd_float3, role: ShipRole, hullOverride: Float? = nil, scale: Float = 1, boss: Bool = false) {
        let node = Meshes.interceptor(art: art)
        node.simdPosition = point
        if scale != 1 { node.simdScale = simd_float3(repeating: scale) }
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
        let hull = hullOverride ?? (showcase ? (role == .bandit ? 42 : 50) : (role == .bandit ? 78 : 96))
        let enemy = Enemy(node: node, position: point, hull: hull, cooldown: showcase ? 1.4 : 0.8 + Float(spawned % 3) * 0.2, role: role)
        enemy.hullMax = hull
        enemy.boss = boss
        enemies.append(enemy)
        spawned += 1
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
        dropPrize(at: enemy.position + simd_float3(6, 1, -4))
    }

    private func destroy(_ enemy: Enemy) {
        guard enemy.alive else { return }
        enemy.alive = false
        if towed === enemy { towed = nil }
        if cycled === enemy { cycled = nil }
        let bossKill = enemy.boss
        let at = enemy.position
        enemy.node.removeFromParentNode()
        kills += 1
        if firstKill < 0 { firstKill = phaseTime }
        streak += 1
        bestStreak = max(bestStreak, streak)
        streakLeft = 4.5
        multiplier = min(8, max(1, streak))
        if !bossKill { lessonKills += 1 }
        addBounty(bossKill ? 900 : 280, text: bossKill ? "WARDEN DOWN" : "RAIDER DOWN", at: at)
        if streak >= 2 {
            say("\(streak)x COMBO")
        } else if bossKill {
            say("WARDEN DOWN")
        }
        let dist = simd_distance(at, position)
        if bossKill {
            bossDead = true
            explode(at: at, power: 1.8, chain: true)
            slowmo = max(slowmo, 0.7)
            shake = min(1.8, shake + 1.6)
        } else {
            explode(at: at, power: dist < 80 ? 1.25 : 1.05, chain: true)
            if dist < 140 {
                shake = min(1.8, shake + (streak >= 2 ? 1.05 : 0.75))
                if streak >= 2 { slowmo = max(slowmo, streak >= 4 ? 0.5 : 0.22) }
            }
        }
        dropPrize(at: at + simd_float3(-5, 2, 3))
    }

    private func bite(_ enemy: Enemy, _ amount: Float) {
        guard enemy.alive, !enemy.disabled else { return }
        enemy.hull -= amount
        if enemy.hull > 0 {
            popups.append(Popup(position: enemy.position + simd_float3(0, 2.2, 0), text: "HIT", age: 0))
            sparkHit(at: enemy.position)
            if shake < 0.35 { shake = min(0.35, shake + 0.08) }
            haptics.hit()
            scorch(enemy)
            return
        }
        if enemy.role == .bandit && !enemy.boss { disable(enemy) } else { destroy(enemy) }
    }

    private func sparkHit(at point: simd_float3) {
        let count = min(6, max(3, profile.sparks / 2))
        for _ in 0..<count {
            let spark = SCNSphere(radius: 0.1)
            spark.segmentCount = 5
            spark.materials = [art.orangeGlow]
            let node = SCNNode(geometry: spark)
            node.simdPosition = point
            scene.rootNode.addChildNode(node)
            let dir = simd_normalize(simd_float3(Float.random(in: -1...1), Float.random(in: 0...1), Float.random(in: -1...1)))
            effects.append(Effect(node: node, life: 0.22, start: 1, end: 0.15, spark: true, velocity: dir * Float.random(in: 16...36)))
        }
    }

    private func scorch(_ enemy: Enemy) {
        let frac = enemy.hull / max(1, enemy.hullMax)
        if frac < 0.55, enemy.node.childNode(withName: "smoke", recursively: false) == nil {
            let plane = SCNPlane(width: 3.4, height: 3.4)
            plane.materials = [art.smoke]
            let node = SCNNode(geometry: plane)
            node.name = "smoke"
            node.simdPosition = simd_float3(0, 1.1, 0)
            node.opacity = 0.8
            node.constraints = [SCNBillboardConstraint()]
            enemy.node.addChildNode(node)
        }
        if frac < 0.32, enemy.node.childNode(withName: "chip", recursively: false) == nil {
            let box = SCNBox(width: 0.8, height: 0.36, length: 1.2, chamferRadius: 0.02)
            box.materials = [art.debris]
            let node = SCNNode(geometry: box)
            node.name = "chip"
            node.simdPosition = simd_float3(1.8, 0.15, -0.5)
            enemy.node.addChildNode(node)
        }
    }

    private func hurtPlayer(_ amount: Float, from point: simd_float3) {
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
        audio.impact()
        flash = max(flash, 0.42)
        shake = min(1.5, shake + 0.55)
        incoming.append(IncomingHit(world: point, life: 1.35))
        if hull <= 0 {
            hull = 0
            died = true
            explode(at: position, power: 1.45, chain: true)
            player.isHidden = true
            haptics.boom(power: 1.3)
        }
    }

    private func explode(at point: simd_float3, power: Float, chain: Bool) {
        audio.explosion(power: power)
        haptics.boom(power: power)
        flash = min(1, flash + 0.85 * power)
        flashLight.simdPosition = point
        flashLight.light?.attenuationEndDistance = CGFloat(70 + 80 * power)
        shake = min(1.8, shake + 0.88 * power)
        if power > 1.4 { slowmo = max(slowmo, 0.35) }
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
        shake = min(1.4, shake + 0.7)
        haptics.launch()
        audio.titleHit()
    }

    private func dropPrize(at point: simd_float3) {
        guard pickups.filter(\.alive).count < 8 else { return }
        let kind = PrizeKind(rawValue: Int.random(in: 0..<9)) ?? .credits
        let node = Meshes.pickup(art: art)
        node.simdPosition = point
        adornPickup(node)
        scene.rootNode.addChildNode(node)
        pickups.append(Pickup(node: node, kind: kind))
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
        case .arc:
            arcRank = min(2, arcRank + 1)
            gun = .arc
            say("ARC GUN")
        case .beam:
            beamRank = min(2, beamRank + 1)
            gun = .beam
            say("BEAM")
        case .phaser:
            phaserRank = min(2, phaserRank + 1)
            gun = .phaser
            say("PHASER")
        }
        if pickup.kind != .credits {
            popups.append(Popup(position: point, text: callout, age: 0))
            score += 120
        }
        haptics.pickup()
        audio.chime()
    }

    private func nearestHostile() -> Enemy? {
        if let cycled, cycled.alive, !cycled.disabled { return cycled }
        return enemies.filter { $0.alive && !$0.disabled }.min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    private func nearestDisabled(maxDistance: Float) -> Enemy? {
        enemies.filter { $0.alive && $0.disabled && simd_distance($0.position, position) < maxDistance }
            .min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    private func aimEnemy() -> Enemy? {
        if let cycled, cycled.alive { return cycled }
        return lockTarget(cone: 0.45)
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
        if bossDead { return "LANE CLEAR" }
        if towed != nil { return "TOW TO FREIGHTER" }
        if nearestDisabled(maxDistance: 800) != nil && lessonKills >= lessonGoal {
            return "DISABLED - BEAM NOW"
        }
        if bossSpawned && enemies.contains(where: { $0.boss && $0.alive }) {
            return "DESTROY THE WARDEN"
        }
        if lessonKills < lessonGoal {
            return "DESTROY \(lessonGoal) RAIDERS\n\(lessonKills)/\(lessonGoal)"
        }
        if raidWave >= 2 && raidWave <= 3 {
            return "WAVE \(raidWave)"
        }
        return "DESTROY THE RAIDERS"
    }

    private func guidePoint() -> (simd_float3, String) {
        if towed != nil { return (dropoff, "FREIGHTER") }
        if lessonKills >= lessonGoal, let wreck = nearestDisabled(maxDistance: 1400) {
            return (wreck.position, "BANDIT")
        }
        if let hostile = enemies.filter({ $0.alive && !$0.disabled }).min(by: {
            simd_distance($0.position, position) < simd_distance($1.position, position)
        }) {
            return (hostile.position, hostile.boss ? "WARDEN" : "RAIDER")
        }
        return (fightCenter, "FIGHT")
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

        Weapon recordings
        Kenney Sci-fi Sounds, CC0

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
        let locked = (phase == .combat && !died) ? (cycled ?? lockTarget(cone: 0.15)) : nil
        hud.lockWorld = locked.map { $0.alive ? $0.position : nil } ?? nil
        if let locked, locked.alive {
            let kind = locked.disabled ? "DISABLED" : (locked.boss ? "WARDEN" : (locked.role == .bandit ? "BANDIT" : "RAIDER"))
            hud.lockTitle = kind
            hud.lockHealth = locked.hullMax > 1 ? max(0, locked.hull / locked.hullMax) : 0
            hud.lockMissile = missileLevel > 0 && !locked.disabled
            hud.lockAttacking = locked.threat > 0 && !locked.disabled
        } else {
            hud.lockTitle = ""
            hud.lockHealth = 0
            hud.lockMissile = false
            hud.lockAttacking = false
        }
        let tone: Float = (hud.lockMissile && phase == .combat) ? 1 : 0
        audio.setLock(tone)
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
        hud.gunName = (showcase ? Gun.pulse : gun).label
        hud.underFire = enemies.contains { $0.alive && !$0.disabled && $0.threat > 0 }
        hud.lessonDone = lessonKills >= lessonGoal || phaseTime > 45
        hud.contacts = []
        hud.blips = []
        hud.threats = []
        if phase == .combat {
            for enemy in enemies where enemy.alive {
                let kind: Int
                if enemy.disabled {
                    kind = 2
                } else if enemy.threat > 0 {
                    kind = 4
                } else if enemy.role == .bandit {
                    kind = 1
                } else {
                    kind = 0
                }
                hud.contacts.append(contact(enemy.position, kind: kind))
                hud.blips.append(blip(enemy.position, kind: kind))
                if kind == 4 {
                    let rel = contact(enemy.position, kind: 4)
                    hud.threats.append(HudThreat(world: enemy.position, bearing: rel.bearing, hit: false))
                }
            }
            for hit in incoming {
                if let index = hud.threats.firstIndex(where: { simd_distance($0.world, hit.world) < 14 }) {
                    hud.threats[index].hit = true
                } else {
                    let rel = contact(hit.world, kind: 4)
                    hud.threats.append(HudThreat(world: hit.world, bearing: rel.bearing, hit: true))
                }
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
                hud.resultsBody = "BOUNTY \(bounty)\n\(kills) RAIDERS DOWN\n\(time) IN THE LANE\nRANK \(rank)"
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
            cockpitOn = false
            refreshCockpitVisibility()
            beginRaid()
        case .warden:
            cockpitOn = false
            refreshCockpitVisibility()
            player.isHidden = false
            guideColumn.isHidden = true
            guideLight.isHidden = true
            spawnWarden()
        case .results:
            cockpitOn = false
            cockpit.isHidden = true
            player.isHidden = false
            guideColumn.isHidden = true
            guideLight.isHidden = true
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
        let beaconMat = SCNMaterial()
        beaconMat.lightingModel = .constant
        beaconMat.diffuse.contents = UIColor(red: 1, green: 0.92, blue: 0.35, alpha: 1)
        beaconMat.emission.contents = UIColor(red: 1, green: 0.92, blue: 0.35, alpha: 1)
        beaconMat.emission.intensity = 2.4
        beaconMat.transparency = 0.85
        beaconMat.blendMode = .add
        beaconMat.writesToDepthBuffer = false
        beaconMat.isDoubleSided = true
        let column = SCNCylinder(radius: 0.55, height: 40)
        column.materials = [beaconMat]
        guideColumn.geometry = column
        guideColumn.isHidden = true
        scene.rootNode.addChildNode(guideColumn)
        guideLight.light = SCNLight()
        guideLight.light?.type = .omni
        guideLight.light?.color = UIColor(red: 1, green: 0.9, blue: 0.4, alpha: 1)
        guideLight.light?.intensity = 1600
        guideLight.light?.attenuationEndDistance = 90
        guideLight.isHidden = true
        scene.rootNode.addChildNode(guideLight)
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
                pickups.append(Pickup(node: node, kind: kinds[pickups.count % kinds.count]))
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
        }
    }
}

private enum ShipRole {
    case bandit, bogey
}

private enum Trick {
    case loop, roll
}

private enum Gun: Int {
    case pulse, arc, beam, phaser

    var label: String {
        switch self {
        case .pulse: return "PULSE"
        case .arc: return "ARC"
        case .beam: return "BEAM"
        case .phaser: return "PHASER"
        }
    }
}

private struct IncomingHit {
    var world: simd_float3
    var life: Float
}

private enum PrizeKind: Int {
    case shield, repair, spread, missile, credits, multi, arc, beam, phaser

    var label: String {
        switch self {
        case .shield: return "SHIELD"
        case .repair: return "REPAIR"
        case .spread: return "SPREAD"
        case .missile: return "MISSILES"
        case .credits: return "CREDITS"
        case .multi: return "PAY"
        case .arc: return "ARC"
        case .beam: return "BEAM"
        case .phaser: return "PHASER"
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
    var threat: Float = 0
    var boss = false
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
    var damage: Float?
    var shooter: Enemy?
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
    init(node: SCNNode, life: Float, start: Float, end: Float, spark: Bool, velocity: simd_float3) {
        self.node = node
        self.life = life
        self.start = start
        self.end = end
        self.spark = spark
        self.velocity = velocity
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
