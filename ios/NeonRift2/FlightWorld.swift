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
    var kills = 0
    var score = 0
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
    var inputFire = false
    /// Viewport width divided by height. Landscape tightens the vertical field of view.
    var viewportAspect: Float = 9.0 / 19.5
    var onFrame: ((FlightWorld) -> Void)?

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
            waveTimes = [0.6, 0.6, 3.2, 3.2]
            waveCount = 4
            hull = 240
            shield = 200
        } else {
            waveTimes = [4, 4, 18, 18, 34, 34, 52, 52, 74, 74]
            waveCount = 10
        }
        super.init()
    }

    func boot() {
        setbuf(stdout, nil)
        audio.startIfNeeded()
        buildScene()
        enter(.cinema)
        onFrame?(self)
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
            onFrame?(self)
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
        onFrame?(self)
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
            } else if spawned >= waveCount && enemies.allSatisfy({ !$0.alive }) && phaseTime > 6 {
                enter(.warden)
            } else if phaseTime > (showcase ? 36 : 150) {
                enter(.warden)
            }
        case .warden:
            stepFlight(sim * 0.35)
            stepWarden(raw)
            if phaseTime > 12.5 { enter(.results) }
        case .results:
            break
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

    private func stepFlight(_ dt: Float) {
        let auto = showcase && phase == .combat && !died
        var stick = inputStick
        var fire = inputFire
        if auto, let target = nearestEnemy() {
            let cross = yawError(toward: target.position)
            stick.x = CGFloat(max(-1, min(1, cross * 2.4)))
            stick.y = 0.8
            let to = safeNorm(target.position - position)
            fire = simd_dot(forward(), to) > 0.9
        } else if auto {
            stick = CGPoint(x: 0, y: 0.45)
            fire = false
        }
        if phase != .combat || died {
            fire = false
            if phase == .warden { stick = .zero }
        }
        hud.stick = stick
        hud.firing = fire

        let mag = hypot(Float(stick.x), Float(stick.y))
        let assisting = mag < 0.08
        yaw += Float(stick.x) * 0.92 * dt
        let targetPitch = Float(stick.y) * 0.10
        pitch += (targetPitch - pitch) * min(1, 3.2 * dt)
        pitch = max(-0.26, min(0.30, pitch))
        let targetRoll = -Float(stick.x) * 0.58
        roll += (targetRoll - roll) * min(1, 4.5 * dt)
        roll = max(-0.7, min(0.7, roll))

        let fwd = forward()
        let thrustScale: Float = Float(stick.y) >= 0 ? Float(stick.y) : Float(stick.y) * 0.62
        var force = fwd * (thrustScale * maxThrust)
        let forwardSpeed = simd_dot(velocity, fwd)
        let lateral = velocity - fwd * forwardSpeed
        let latK: Float = assisting ? 1.2 : 0.32
        force += -lateral * latK * mass
        if assisting {
            force += -fwd * forwardSpeed * 0.48 * mass
        }
        if position.y < 2 { force.y += (2 - position.y) * mass * 3 }
        if position.y > 22 { force.y -= (position.y - 22) * mass * 3 }
        if abs(position.x) > 230 {
            force.x -= (position.x - copysign(230, position.x)) * mass * 1.4
        }
        if position.z > 40 { force.z -= (position.z - 40) * mass }
        if position.z < -560 { force.z -= (position.z + 560) * mass }

        velocity += force / mass * dt
        let speed = simd_length(velocity)
        if speed > 96 { velocity *= 96 / speed }
        if !speed.isFinite { velocity = .zero }
        position += velocity * dt
        placePlayer()

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
        let wantFire = fire && weapon > 4
        if wantFire && fireClock <= 0 {
            weapon = max(0, weapon - 5)
            fireClock = showcase ? 0.16 : 0.13
            shootPlayer()
        }
    }

    private func stepCombat(_ dt: Float) {
        if showcase && phaseTime > 18 && kills == 0, let enemy = nearestEnemy() {
            enemy.hull = 0
            destroy(enemy)
        }
        while spawned < waveCount && phaseTime >= waveTimes[spawned] {
            let side: Float = spawned % 2 == 0 ? -1 : 1
            let spread = side * (36 + Float(spawned % 3) * 14)
            let ahead: Float = showcase ? 78 : 168
            spawnEnemy(at: simd_float3(position.x + spread, 7 + Float(spawned % 4), position.z - ahead))
            spawned += 1
        }
        for enemy in enemies where enemy.alive {
            steer(enemy, dt)
        }
        if hurt > 0 { hurt -= dt }
        if regenWait > 0 {
            regenWait -= dt
        } else if shield < 100 && !died {
            shield = min(100, shield + 18 * dt)
        }
        for pickup in pickups where pickup.alive {
            pickup.node.eulerAngles.y += dt * 1.4
            if simd_distance(pickup.node.simdPosition, position) < 11 {
                pickup.alive = false
                pickup.node.removeFromParentNode()
                shield = 100
                score += 150
                popups.append(Popup(position: pickup.node.simdPosition, text: "+150", age: 0))
                haptics.pickup()
                audio.shot()
            }
        }
        if !markedCombat && (firstKill > 0 && phaseTime > firstKill + 0.45 || phaseTime > 8) {
            markedCombat = true
            logMark("NR2 mark combat")
        }
    }

    private func steer(_ enemy: Enemy, _ dt: Float) {
        enemy.age += dt
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
        enemy.node.simdPosition = enemy.position

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
            if let target = bolt.home, target.alive {
                let to = safeNorm(target.position - bolt.position)
                if simd_dot(bolt.direction, to) > 0.4 {
                    let k = 1 - exp(-4.2 * dt)
                    bolt.direction = safeNorm(bolt.direction * (1 - k) + to * k)
                }
            }
            let next = bolt.position + bolt.direction * bolt.speed * dt
            if bolt.fromPlayer {
                for enemy in enemies where enemy.alive {
                    if segmentHits(bolt.position, next, enemy.position, radius: 3.4) {
                        bolt.alive = false
                        enemy.hull -= showcase ? 28 : 20
                        if enemy.hull <= 0 { destroy(enemy) }
                        break
                    }
                }
            } else if !died && hurt <= 0 {
                if segmentHits(bolt.position, next, position, radius: 2.3) {
                    bolt.alive = false
                    hurtPlayer(16)
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
        flash = max(0, flash - dt * 2.4)
        shake = max(0, shake - dt * 1.6)
    }

    private func stepDebris() {
        let now = missionTime
        debris.removeAll { item in
            if now - item.born > 4.8 {
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

    private func updateCamera(_ raw: Float) {
        let fwd = forward()
        let chasePos = position - fwd * 15.5 + simd_float3(0, 3.7, 0)
        let chaseLook = position + fwd * 24 + simd_float3(0, 0.4, 0)
        var desired = chasePos
        var look = chaseLook
        var rollCam = roll * 0.38

        if phase == .cinema {
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

    private func shootPlayer() {
        let hard = lockTarget(cone: 0.82)
        for local in [ShipPoints.gunL, ShipPoints.gunR] {
            let origin = worldPoint(local) + forward() * 1.2
            var dir = forward()
            if let hard {
                let to = safeNorm(hard.position - origin)
                dir = safeNorm(dir * 0.72 + to * 0.28)
            }
            spawnBolt(origin: origin, direction: dir, speed: 230, life: 1.25, player: true, home: hard, mat: art.boltPlayer)
        }
        audio.shot()
        haptics.shot()
    }

    private func shootEnemy(_ enemy: Enemy, toward: simd_float3) {
        let origin = enemy.position + toward * 3
        spawnBolt(origin: origin, direction: toward, speed: 125, life: 2.4, player: false, home: nil, mat: art.boltEnemy)
    }

    private func spawnBolt(origin: simd_float3, direction: simd_float3, speed: Float, life: Float, player: Bool, home: Enemy?, mat: SCNMaterial) {
        let box = SCNBox(width: 0.14, height: 0.14, length: player ? 4.6 : 3.2, chamferRadius: 0)
        box.materials = [mat]
        let node = SCNNode(geometry: box)
        node.simdPosition = origin
        node.simdOrientation = lookOrientation(forward: direction, up: simd_float3(0, 1, 0), roll: 0)
        scene.rootNode.addChildNode(node)
        bolts.append(Bolt(node: node, position: origin, direction: direction, speed: speed, life: life, fromPlayer: player, home: home))
    }

    private func spawnEnemy(at point: simd_float3) {
        let node = Meshes.interceptor(art: art)
        node.simdPosition = point
        scene.rootNode.addChildNode(node)
        let hull: Float = showcase ? 64 : 100
        enemies.append(Enemy(node: node, position: point, hull: hull, cooldown: showcase ? 2.8 : 1.4 + Float(spawned % 3) * 0.3))
    }

    private func destroy(_ enemy: Enemy) {
        guard enemy.alive else { return }
        enemy.alive = false
        enemy.node.removeFromParentNode()
        kills += 1
        score += 250
        if firstKill < 0 { firstKill = phaseTime }
        popups.append(Popup(position: enemy.position, text: "+250", age: 0))
        explode(at: enemy.position, power: 1)
        let dist = simd_distance(enemy.position, position)
        if dist < 90 {
            slowmo = 0.1
            shake = min(1.2, shake + 0.55)
        }
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
        shake = min(1.2, shake + 0.4)
        if hull <= 0 {
            hull = 0
            died = true
            explode(at: position, power: 1.3)
            player.isHidden = true
            haptics.boom()
        }
    }

    private func explode(at point: simd_float3, power: Float) {
        audio.explosion()
        haptics.boom()
        flash = min(1, flash + 0.7 * power)
        flashLight.simdPosition = point
        let fire = SCNPlane(width: 6, height: 6)
        fire.materials = [art.fire]
        let fireNode = SCNNode(geometry: fire)
        fireNode.simdPosition = point
        fireNode.constraints = [SCNBillboardConstraint()]
        scene.rootNode.addChildNode(fireNode)
        effects.append(Effect(node: fireNode, life: 0.55, start: 0.4, end: 3.2 * power, spark: false, velocity: .zero))

        let smoke = SCNPlane(width: 7, height: 7)
        smoke.materials = [art.smoke]
        let smokeNode = SCNNode(geometry: smoke)
        smokeNode.simdPosition = point
        smokeNode.constraints = [SCNBillboardConstraint()]
        scene.rootNode.addChildNode(smokeNode)
        effects.append(Effect(node: smokeNode, life: 1.15, start: 0.8, end: 4.5 * power, spark: false, velocity: .zero))

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

    private func nearestEnemy() -> Enemy? {
        enemies.filter(\.alive).min { simd_distance($0.position, position) < simd_distance($1.position, position) }
    }

    private func lockTarget(cone: Float) -> Enemy? {
        let fwd = forward()
        return enemies.filter { enemy in
            guard enemy.alive else { return false }
            let to = enemy.position - position
            let dist = simd_length(to)
            return dist < 230 && simd_dot(fwd, to / dist) > cone
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
        hud.lockWorld = (phase == .combat && !died) ? lockTarget(cone: 0.35)?.position : nil
        hud.pickups = phase == .combat ? pickups.filter(\.alive).map(\.node.simdPosition) : []
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
                hud.resultsBody = "SHIP LOST\n\n\(kills) INTERCEPTORS\n\(time) IN THE LANE\nSCORE \(score)\n\nTAP TO FLY AGAIN"
            } else {
                hud.resultsBody = "\(kills) INTERCEPTORS\n\(time) IN THE LANE\nSCORE \(score)\n\nTHE RIFT WARDEN SEES YOU\n\nTAP TO FLY AGAIN"
            }
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
            cockpit.isHidden = true
            if showcase {
                // Already in open space after the launch. Keep momentum.
            }
        case .warden:
            cockpit.isHidden = false
            spawnWarden()
        case .results:
            cockpit.isHidden = true
            audio.setThrust(0.05)
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
        scene.lightingEnvironment.contents = art.faces
        scene.lightingEnvironment.intensity = 1.15
        scene.physicsWorld.gravity = SCNVector3Zero

        camera.wantsHDR = true
        camera.wantsExposureAdaptation = false
        camera.exposureOffset = 0.28
        camera.bloomIntensity = profile.bloom
        camera.bloomThreshold = 0.42
        camera.bloomBlurRadius = 10
        camera.saturation = 1.18
        camera.contrast = 1.08
        camera.vignettingIntensity = 0.42
        camera.vignettingPower = 1.15
        camera.colorFringeStrength = 0.35
        camera.colorFringeIntensity = 0.18
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
        sun.light?.intensity = 1400
        sun.light?.temperature = 5600
        sun.light?.castsShadow = false
        sun.simdPosition = SpaceLook.sunDirection * 200
        sun.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(sun)

        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .directional
        fill.light?.intensity = 260
        fill.light?.color = UIColor(red: 0.45, green: 0.75, blue: 0.85, alpha: 1)
        fill.simdPosition = simd_float3(200, -40, 80)
        fill.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(fill)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 30
        ambient.light?.color = UIColor(red: 0.25, green: 0.32, blue: 0.4, alpha: 1)
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
        player.addChildNode(ship)
        scene.rootNode.addChildNode(player)
        placePlayer()

        hangar = Meshes.hangar(art: art)
        scene.rootNode.addChildNode(hangar)

        rift = Meshes.rift(art: art, radius: 120)
        rift.simdPosition = simd_float3(0, 18, -900)
        scene.rootNode.addChildNode(rift)

        scene.rootNode.addChildNode(Meshes.planet(art: art))
        scene.rootNode.addChildNode(Meshes.sun(art: art))

        cockpit = Meshes.cockpit(art: art)
        cockpit.isHidden = true
        cameraNode.addChildNode(cockpit)

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
                scene.rootNode.addChildNode(node)
                pickups.append(Pickup(node: node))
            }
        }

        for rock in 0..<5 {
            let s = CGFloat(4 + rock * 2)
            let box = SCNBox(width: s, height: s * 0.7, length: s * 1.2, chamferRadius: 0.4)
            box.materials = [art.debris]
            let node = SCNNode(geometry: box)
            node.simdPosition = simd_float3(Float(80 + rock * 30), Float(20 - rock * 6), Float(-200 - rock * 80))
            node.eulerAngles = SCNVector3(Float(rock), Float(rock) * 0.4, Float(0.2))
            scene.rootNode.addChildNode(node)
        }
    }
}

private final class Enemy {
    let node: SCNNode
    var position: simd_float3
    var velocity = simd_float3.zero
    var hull: Float
    var cooldown: Float
    var age: Float = 0
    var strafe: Float = 1
    var seed: Float = Float.random(in: 0...6)
    var alive = true
    init(node: SCNNode, position: simd_float3, hull: Float, cooldown: Float) {
        self.node = node
        self.position = position
        self.hull = hull
        self.cooldown = cooldown
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
    var alive = true
    init(node: SCNNode) { self.node = node }
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
