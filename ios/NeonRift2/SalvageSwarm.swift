import CoreMotion
import Darwin
import SceneKit
import UIKit
import simd

/// Salvage Swarm. Spot a red foe, put the crosshair on it, shoot.
/// The camera stays behind the ship with a fixed horizon: no roll, no orbit.
/// A kill or a charged blast cuts to one steady outside dolly, then snaps back.
/// Nothing aims, fires, dashes, or picks up wreckage unless the player does it.
/// The showcase reel is the only simulated player, and only while -showcase is set.

private enum SwarmPhase {
    case gate, run, cards, results
}

private enum PartKind {
    case turret, plate, engine
}

private enum FoeKind {
    case drone, lancer, ring, boss
}

private enum SwarmBuzz {
    case shot, dash, blast, graze, bolt, hurt, boom, tap, torpedo
}

private struct SwarmSnap {
    var phase: SwarmPhase = .gate
    var remain: Float = 60
    var health: Float = 120
    var healthMax: Float = 120
    var score: Int = 0
    var graze: String = ""
    var grazeAlpha: Float = 0
    var flash: Float = 0
    var aimPoint: simd_float3?
    var lockPoint: simd_float3?
    var locked = false
    var shotCam = false
    var cardTitles: [String] = []
    var cardDetails: [String] = []
    var parts: Int = 0
    var survived: Float = 0
    var cleared = false
    var buzz: [SwarmBuzz] = []
    var cockpit = false
}

private struct SwarmPad {
    var move = simd_float2.zero
    var moveOn = false
    var aim = simd_float2.zero
    var aimOn = false
    var release = false
    var dash = simd_float3.zero
    var dashOn = false
    var skip = false
    var gravity = SIMD3<Double>.zero
    var hasGravity = false
    var tilt = false
    var shotEvery = false
    var cockpit = false
    var torpedo = false
}

private struct CardOffer {
    var title: String
    var detail: String
    var apply: Int
}

final class SalvageWorld: NSObject, SCNSceneRendererDelegate {
    let scene = SCNScene()
    let cameraNode = SCNNode()
    let shotNode = SCNNode()
    let pipNode = SCNNode()
    fileprivate var onSnap: ((SwarmSnap) -> Void)?

    private let audio: FlightAudio
    private let showcase: Bool
    private let art = ArtSet.shared
    private let lock = NSLock()
    private var pad = SwarmPad()

    private let player = SCNNode()
    private let ship: SCNNode
    private let aimLine = SCNNode()
    private let lockRing = SCNNode()
    private let boomLight = SCNNode()
    private var aimMat = SCNMaterial()

    private var phase: SwarmPhase = .gate
    private var gateTime: Float = 0
    private var simTime: Float = 0
    private var realRun: Float = 0
    private var lastTime: TimeInterval = 0
    private var markedCinema = false
    private var markedHangar = false
    private var markedCombat = false
    private var markedWarden = false
    private var markedResults = false

    private var pos = simd_float3.zero
    private var hull: Float = 120
    private var hullMax: Float = 120
    private var score = 0
    private var died = false
    private var cleared = false
    private var iframes: Float = 0
    private var dashLeft: Float = 0
    private var dashVel = simd_float3.zero
    private var dashCool: Float = 0
    private var charge: Float = 0
    private var fireCool: Float = 0
    private var rapid: Float = 1
    private var heavy: Float = 0
    private var spreadRank: Float = 0
    private var rangeRank: Float = 0
    private var dashRank: Float = 0
    private var turrets = 0
    private var plates = 0
    private var engines = 0
    private var shotEvery = false
    private var tiltOn = false
    private var tiltRef = SIMD3<Double>.zero
    private var tiltReady = false

    private var foes: [Foe] = []
    private var bolts: [Bolt] = []
    private var wrecks: [Wreck] = []
    private var bits: [Bit] = []
    private var beams: [Beam] = []
    private var spawnTimer: Float = 0.4
    private var bossSpawned = false
    private var bossAge: Float = 0
    private var offered: [CardOffer] = []
    private var cardReal: Float = 0
    private var dealt15 = false
    private var dealt30 = false
    private var dealt45 = false
    private var nextPart: PartKind = .turret

    private var camAge: Float = 0
    private var camGap: Float = 0
    private var camLeft: Float = 0
    private var camEye = simd_float3.zero
    private var camAnchor = simd_float3.zero
    private var camQuat = simd_quatf(angle: 0, axis: simd_float3(0, 1, 0))
    private var camHold = false
    private var posed = false
    private var poseCockpit = false
    private let commandQuat = levelLook(forward: simd_float3(0, -1, 0), fallbackRight: simd_float3(1, 0, 0))
    private let cockpitQuat = levelLook(forward: simd_float3(0, -0.04, -1), fallbackRight: simd_float3(1, 0, 0))
    private var pipLeft: Float = 0
    private var grazeText = ""
    private var grazeLeft: Float = 0
    private var flash: Float = 0
    private var shake: Float = 0
    private var shakePhase: Float = 0
    private var frameRaw: Float = 1.0 / 60
    private var buzz: [SwarmBuzz] = []
    private var aimWorld = simd_float3(0, 0, -20)
    private var lockWorld: simd_float3?
    private var locked = false
    private var muzzle = 0
    private var cockpit = false
    private var torpedoCool: Float = 0
    private var lastAim = simd_float3(0, 0, -1)

    init(audio: FlightAudio, showcase: Bool) {
        self.audio = audio
        self.showcase = showcase
        ship = Meshes.fighter(art: art)
        super.init()
        ShipLivery.current.apply(to: ship, art: art)
        buildScene()
    }

    fileprivate func updatePad(_ body: (inout SwarmPad) -> Void) {
        lock.lock()
        body(&pad)
        lock.unlock()
    }

    func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        let raw = lastTime == 0 ? 1.0 / 60 : min(1.0 / 20, max(0, Float(time - lastTime)))
        lastTime = time
        step(raw)
    }

    private func step(_ raw: Float) {
        let input = peekPad()
        frameRaw = raw
        if phase == .gate { cockpit = input.cockpit }
        shakePhase += raw
        shake = max(0, shake - raw * 1.7)
        torpedoCool = max(0, torpedoCool - raw)
        buzz.removeAll()
        if !markedCinema {
            markedCinema = true
            logMark("NR2 phase cinema")
        }
        gateTime += raw
        if phase == .gate && !markedHangar && gateTime > 1.15 {
            markedHangar = true
            logMark("NR2 mark hangar")
        }
        let queued = takeCommands()
        if (showcase && phase == .gate && gateTime > 2.15) || (queued.play && phase == .gate) {
            begin(input)
        }
        if queued.pick >= 0 {
            pick(queued.pick)
        }

        var sim = raw
        if phase == .run && camHold {
            camAge += raw
            camLeft = max(0, camLeft - raw)
            if input.skip || camLeft <= 0 {
                endCam()
            } else {
                sim = raw * 0.42
            }
        }
        let playerDt = phase == .run && camHold ? raw * 0.9 : sim

        if phase == .run {
            realRun += raw
            simTime += sim
            if showcase { showcaseDrive() }
            let live = consumePad()
            movePlayer(live, dt: playerDt)
            fight(live, dt: sim)
            if simTime >= 60 && !died {
                cleared = true
                finish()
            }
        } else if phase == .cards {
            cardReal += raw
            if showcase && cardReal > 0.75 {
                pick(0)
            }
            _ = consumePad()
        } else {
            _ = consumePad()
        }

        flash = max(0, flash - raw * 1.6)
        grazeLeft = max(0, grazeLeft - raw)
        pipLeft = max(0, pipLeft - raw)
        if !camHold { camGap = max(0, camGap - raw) }
        updateBits(sim)
        updateCamera()
        publish()
    }

    private func begin(_ input: SwarmPad) {
        guard phase == .gate || phase == .results else { return }
        phase = .run
        shotEvery = input.shotEvery
        tiltOn = input.tilt
        if input.hasGravity {
            tiltRef = input.gravity
            tiltReady = true
        }
        audio.startIfNeeded()
        audio.setMusic(0.22)
        audio.setThrust(0)
        cockpit = input.cockpit
        posed = false
        if foes.isEmpty {
            spawnFoe(kind: .drone, at: simd_float3(-3.5, 0, -16))
            spawnFoe(kind: .drone, at: simd_float3(4.2, 0, -20))
        }
        logMark("NR2 phase combat")
    }

    private func pick(_ index: Int) {
        guard phase == .cards, offered.indices.contains(index) else { return }
        switch offered[index].apply {
        case 0: rapid = max(0.62, rapid * 0.78)
        case 1: spreadRank += 1
        case 2: heavy += 1
        case 3:
            hullMax += 22
            hull = min(hullMax, hull + 36)
        case 4: rangeRank += 1
        default: dashRank += 1
        }
        offered.removeAll()
        cardReal = 0
        phase = .run
        buzz.append(.tap)
        audio.chime()
    }

    private func fight(_ input: SwarmPad, dt: Float) {
        iframes = max(0, iframes - dt)
        dashCool = max(0, dashCool - dt)
        if input.dashOn && dashCool <= 0 {
            let len = simd_length(input.dash)
            if len > 0.2 {
                dashVel = input.dash / len * (62 + Float(engines) * 6)
                dashLeft = 0.22
                dashCool = max(0.45, 0.92 - dashRank * 0.12)
                iframes = 0.26
                flash = max(flash, 0.25)
                audio.setLaunch(1)
                audio.shot(1)
                buzz.append(.dash)
            }
        }
        if dashLeft > 0 {
            dashLeft -= dt
            pos += dashVel * dt
        }

        let origin = simd_float3(pos.x, 0.6, pos.z)
        var aimDir = aimDirection(input.aim)
        let focus = foeAlong(aimDir, from: origin)
        if let focus, input.aimOn {
            let to = swarmNorm(focus.pos - origin)
            let ang = angleBetween(aimDir, to)
            if ang < 0.18 {
                let pull = (1 - ang / 0.18) * 0.30
                aimDir = swarmNorm(mix3(aimDir, to, pull))
            }
        }
        locked = false
        lockWorld = nil
        if let focus {
            let ang = angleBetween(aimDir, swarmNorm(focus.pos - origin))
            if ang < 0.16 && simd_distance(focus.pos, origin) < 48 + rangeRank * 6 {
                locked = true
                lockWorld = focus.pos
            }
        }
        aimWorld = origin + aimDir * 22
        if cockpit {
            player.simdOrientation = simd_quatf(angle: 0, axis: simd_float3(0, 1, 0))
        } else {
            let yaw = atan2(-aimDir.x, -aimDir.z)
            player.simdOrientation = simd_quatf(angle: yaw, axis: simd_float3(0, 1, 0))
        }
        poseAimLine(from: origin, dir: aimDir, hot: input.aimOn)

        if input.torpedo && torpedoCool <= 0 {
            fireTorpedo(dir: aimDir, from: origin, focus: focus)
        }

        let firing = input.aimOn && simd_length(input.aim) > 0.12
        if firing {
            charge = min(1, charge + dt * 0.62)
            fireCool -= dt
            let gap = 0.18 * rapid
            if fireCool <= 0 {
                fireCool = gap
                launchVolley(dir: aimDir, from: origin, focus: focus, blast: false)
            }
        }
        if input.release {
            if charge >= 0.72 {
                launchVolley(dir: aimDir, from: origin, focus: focus, blast: true)
                buzz.append(.blast)
            }
            charge = 0
        }

        updateFoes(dt, playerPos: pos)
        updateBolts(dt)
        updateBeams(dt)
        updateWrecks(dt)
        collide(dt)
        spawnWave(dt)
        offerCardIfDue()
        if hull <= 0 && !died {
            died = true
            finish()
        }
        if bossSpawned { bossAge += dt }
        if !markedCombat && simTime > 4.2 && foes.contains(where: { $0.alive }) && !camHold {
            markedCombat = true
            logMark("NR2 mark combat")
        }
        if bossSpawned && !markedWarden && bossAge > 1.15 && (!camHold || bossAge > 3.4) {
            markedWarden = true
            logMark("NR2 mark warden")
        }
    }

    private func movePlayer(_ input: SwarmPad, dt: Float) {
        var stick = input.move
        if tiltOn && !input.moveOn && input.hasGravity {
            if !tiltReady {
                tiltRef = input.gravity
                tiltReady = true
            }
            stick = tiltStick(gravity: input.gravity, reference: tiltRef)
        }
        let speed: Float = (20 + Float(engines) * 3.2) * (dashLeft > 0 ? 0.35 : 1)
        if simd_length(stick) > 0.08 {
            pos.x += stick.x * speed * dt
            pos.z += -stick.y * speed * dt
        }
        pos.x = min(9.5, max(-9.5, pos.x))
        pos.z = min(8, max(-6, pos.z))
        pos.y = 0
        player.simdPosition = pos
        let grown = 0.70 + Float(turrets + plates + engines) * 0.028
        player.simdScale = simd_float3(repeating: grown)
        audio.setThrust(0)
    }

    private func aimDirection(_ aim: simd_float2) -> simd_float3 {
        if cockpit {
            let x = min(1, max(-1, aim.x))
            let y = min(1, max(-1, aim.y))
            if abs(x) < 0.04 && abs(y) < 0.04 { return lastAim }
            let dir = swarmNorm(simd_float3(x * 0.55, y * 0.1, -1))
            lastAim = dir
            return dir
        }
        // Screen up is world -Z and screen right is world +X, in both views.
        let x = aim.x
        let z = -aim.y
        if hypot(x, z) < 0.08 { return lastAim }
        let dir = swarmNorm(simd_float3(x, 0, z))
        lastAim = dir
        return dir
    }

    private func launchVolley(dir: simd_float3, from origin: simd_float3, focus: Foe?, blast: Bool) {
        let guns = blast ? 1 : 2 + turrets
        let damage: Float = blast ? 36 + heavy * 8 : 7 + heavy * 4
        let killing = focus.map { $0.hull <= damage * Float(guns) + 14 } ?? false
        let cinematic = cockpit || shotEvery || blast || killing
        openShotCam(cinematic, from: origin, to: focus?.pos ?? (origin + dir * 24), seconds: blast || killing ? 2.05 : 1.8)
        let spread = blast ? 0 : spreadRank * 0.07
        for index in 0..<guns {
            let along: Float = guns == 1 ? 0 : (Float(index) - Float(guns - 1) * 0.5)
            let yaw = along * (0.045 + spread)
            let side = simd_float3(dir.z, 0, -dir.x)
            let shotDir = swarmNorm(dir + side * yaw + simd_float3(0, along * 0.01, 0))
            let speed: Float = (blast ? 96 : 80) * (1 + rangeRank * 0.08)
            let life: Float = blast ? 1.35 : 0.85 + rangeRank * 0.08
            spawnBolt(
                origin: origin + side * along * 0.35,
                dir: shotDir,
                speed: speed,
                life: life,
                player: true,
                damage: damage,
                radius: blast ? 0.7 : 0.28,
                blast: blast,
                featured: cinematic && index == 0
            )
        }
        muzzle = (muzzle + 1) % 2
        audio.shot(blast ? 3 : 0)
        buzz.append(blast ? .boom : .shot)
        flash = max(flash, blast ? 0.55 : 0.18)
        bumpShake(blast ? 0.8 : 0.38)
    }

    private func fireTorpedo(dir: simd_float3, from origin: simd_float3, focus: Foe?) {
        torpedoCool = 2.1
        let target = focus?.pos ?? (origin + dir * 26)
        openShotCam(true, from: origin, to: target, seconds: 2.2)
        spawnBolt(
            origin: origin + dir * 1.4,
            dir: dir,
            speed: 22,
            life: 3.2,
            player: true,
            damage: 240,
            radius: 1.15,
            blast: true,
            featured: true,
            torpedo: true
        )
        audio.shot(4)
        buzz.append(.torpedo)
        flash = max(flash, 0.4)
        bumpShake(0.7)
    }

    /// Outside view of a shot. The first call cuts. A later call only holds the same angle.
    private func openShotCam(_ show: Bool, from origin: simd_float3, to target: simd_float3, seconds: Float) {
        guard show else { return }
        if camHold {
            camLeft = max(camLeft, min(seconds, 1.35))
            return
        }
        beginCam(from: origin, to: target, seconds: seconds)
    }

    private func spawnBolt(
        origin: simd_float3,
        dir: simd_float3,
        speed: Float,
        life: Float,
        player: Bool,
        damage: Float,
        radius: Float,
        blast: Bool,
        featured: Bool,
        torpedo: Bool = false
    ) {
        let mat = glow(
            torpedo
                ? UIColor(red: 0.75, green: 0.95, blue: 1, alpha: 1)
                : (player ? UIColor(red: 0.55, green: 0.9, blue: 1, alpha: 1) : UIColor(red: 1, green: 0.35, blue: 0.15, alpha: 1)),
            intensity: torpedo ? 2.4 : 1.2,
            alpha: 0
        )
        let sphere = SCNSphere(radius: CGFloat(torpedo ? 0.72 : (blast ? 0.55 : (player ? 0.22 : 0.62))))
        sphere.segmentCount = torpedo ? 12 : 8
        sphere.materials = [mat]
        let node = SCNNode(geometry: sphere)
        node.simdPosition = origin
        scene.rootNode.addChildNode(node)
        bolts.append(Bolt(
            node: node,
            pos: origin,
            vel: swarmNorm(dir) * speed,
            life: life,
            player: player,
            damage: damage,
            radius: radius,
            grazed: false,
            blast: blast,
            featured: featured,
            torpedo: torpedo
        ))
        if bolts.count > 70 {
            bolts.removeFirst().node.removeFromParentNode()
        }
    }

    private func updateBolts(_ dt: Float) {
        var keep: [Bolt] = []
        for var bolt in bolts {
            let clock = (bolt.featured && camHold) ? max(dt, frameRaw * 0.82) : dt
            bolt.life -= clock
            bolt.pos += bolt.vel * clock
            bolt.node.simdPosition = bolt.pos
            if bolt.life <= 0 || abs(bolt.pos.x) > 48 || bolt.pos.z > 20 || bolt.pos.z < -70 {
                if bolt.torpedo && bolt.life <= 0 { detonateTorpedo(at: bolt.pos, direct: nil) }
                bolt.node.removeFromParentNode()
            } else {
                keep.append(bolt)
            }
        }
        bolts = keep
        watchKillingShots()
    }

    /// If a shot will kill and the outside view is not already up, cut to it
    /// while the bolt is still in the air so the hit is on screen.
    private func watchKillingShots() {
        guard !camHold, phase == .run else { return }
        for bolt in bolts where bolt.player {
            for foe in foes where foe.alive {
                if simd_distance(bolt.pos, foe.pos) < 12 && foe.hull <= bolt.damage + 10 {
                    beginCam(from: pos, to: foe.pos, seconds: bolt.torpedo ? 2.1 : 1.75)
                    return
                }
            }
        }
    }

    private func collide(_ dt: Float) {
        _ = dt
        var deadBolts = Set<Int>()
        for index in bolts.indices {
            let bolt = bolts[index]
            if bolt.player {
                var hit = false
                for foe in foes where foe.alive {
                    if simd_distance(bolt.pos, foe.pos) < bolt.radius + foe.radius {
                        if bolt.torpedo {
                            detonateTorpedo(at: bolt.pos, direct: foe)
                        } else {
                            hurtFoe(foe, damage: bolt.damage, featured: bolt.featured, blast: bolt.blast)
                        }
                        hit = true
                        break
                    }
                }
                if hit { deadBolts.insert(index) }
            } else if simd_distance(bolt.pos, pos) < bolt.radius + 1.45 {
                if iframes <= 0 {
                    hull -= bolt.damage
                    iframes = 0.28
                    flash = 1
                    audio.impact()
                    buzz.append(.hurt)
                }
                deadBolts.insert(index)
            } else if !bolt.grazed && simd_distance(bolt.pos, pos) < bolt.radius + 3.5 {
                bolts[index].grazed = true
                score += 25
                charge = min(1, charge + 0.16)
                grazeText = "GRAZE"
                grazeLeft = 0.7
                audio.chime()
                buzz.append(.graze)
            }
        }
        for index in deadBolts.sorted(by: >) {
            bolts[index].node.removeFromParentNode()
            bolts.remove(at: index)
        }
    }

    private func detonateTorpedo(at point: simd_float3, direct: Foe?) {
        var killed = false
        if let direct {
            let wasAlive = direct.alive
            hurtFoe(direct, damage: 240, featured: true, blast: true)
            killed = wasAlive && !direct.alive
        }
        for foe in foes where foe.alive {
            if let direct, foe === direct { continue }
            if simd_distance(foe.pos, point) < 4.4 {
                hurtFoe(foe, damage: 90, featured: false, blast: true)
            }
        }
        if !killed {
            explode(at: point, power: 1.7)
        }
        bumpShake(1)
        buzz.append(.torpedo)
        if !camHold {
            beginCam(from: pos, to: point, seconds: 1.8)
        } else {
            camLeft = max(camLeft, 0.9)
        }
    }

    private func hurtFoe(_ foe: Foe, damage: Float, featured: Bool, blast: Bool) {
        foe.hull -= damage
        _ = featured
        foe.flash = 0.12
        spark(at: foe.pos)
        audio.impact()
        bumpShake(blast ? 0.55 : 0.28)
        if foe.hull <= 0 && foe.alive {
            foe.alive = false
            score += foe.kind == .boss ? 800 : 100
            explode(at: foe.pos, power: foe.kind == .boss ? 1.6 : 1.05)
            dropWreck(at: foe.pos)
            foe.node.removeFromParentNode()
            // A kill always cuts to the outside view, even when the shot was not predicted.
            if !camHold {
                beginCam(from: pos, to: foe.pos, seconds: 1.75)
            } else {
                camLeft = max(camLeft, 0.85)
            }
        } else if !camHold && !cockpit && !shotEvery {
            if pipLeft <= 0 { showPip(at: foe.pos) }
        }
    }

    private func updateFoes(_ dt: Float, playerPos: simd_float3) {
        for foe in foes where foe.alive {
            foe.age += dt
            foe.flash = max(0, foe.flash - dt)
            foe.cooldown -= dt
            if foe.windup > 0 {
                foe.windup -= dt
                foe.telegraph?.simdPosition = foe.windupDir * 6
                if foe.windup <= 0 {
                    foe.telegraph?.removeFromParentNode()
                    foe.telegraph = nil
                    releasePattern(foe)
                }
            } else if foe.cooldown <= 0 {
                arm(foe, playerPos: playerPos)
            }
            switch foe.kind {
            case .drone:
                let to = swarmNorm(simd_float3(playerPos.x - foe.pos.x, 0, playerPos.z - foe.pos.z))
                foe.vel = mix3(foe.vel, to * 7.5, min(1, dt * 1.4))
            case .lancer:
                break
            case .ring:
                let radial = simd_float2(foe.pos.x - playerPos.x, foe.pos.z - playerPos.z)
                let dist = simd_length(radial)
                if dist > 10 {
                    foe.vel = swarmNorm(simd_float3(-radial.x, 0, -radial.y)) * 8
                } else {
                    foe.vel = simd_float3(-radial.y, 0, radial.x) / max(dist, 1) * 5
                }
            case .boss:
                if foe.pos.z < -12 {
                    foe.vel = simd_float3(0, 0, 6)
                } else {
                    foe.vel = simd_float3(sin(foe.age * 0.7) * 4, 0, 0)
                }
            }
            foe.pos += foe.vel * dt
            if foe.kind != .boss && (foe.pos.z > playerPos.z + 12 || abs(foe.pos.x) > 22) {
                foe.alive = false
                foe.node.removeFromParentNode()
            }
            foe.node.simdPosition = foe.pos
            for child in foe.body.childNodes {
                child.geometry?.materials.first?.emission.intensity = foe.flash > 0 ? 2.4 : 1.05
            }
        }
        foes.removeAll { foe in
            if !foe.alive { foe.telegraph?.removeFromParentNode() }
            return !foe.alive
        }
    }

    private func arm(_ foe: Foe, playerPos: simd_float3) {
        let to = swarmNorm(simd_float3(playerPos.x - foe.pos.x, 0, max(-0.2, playerPos.z - foe.pos.z)))
        foe.windupDir = to
        foe.windup = foe.kind == .boss ? 0.62 : 0.42
        foe.cooldown = foe.kind == .boss ? 2.1 : (foe.kind == .ring ? 1.8 : 1.55)
        let box = SCNBox(width: 0.12, height: 0.12, length: 12, chamferRadius: 0)
        let mat = glow(UIColor(red: 1, green: 0.25, blue: 0.12, alpha: 1), intensity: 0.6, alpha: 0.35)
        box.materials = [mat]
        let node = SCNNode(geometry: box)
        node.simdPosition = to * 6
        node.simdOrientation = swarmLook(forward: to, up: simd_float3(0, 1, 0))
        foe.telegraph = node
        foe.node.addChildNode(node)
    }

    private func releasePattern(_ foe: Foe) {
        let dir = foe.windupDir
        switch foe.kind {
        case .drone:
            for index in -1...1 {
                let yaw = Float(index) * 0.20
                let side = simd_float3(dir.z, 0, -dir.x)
                spawnBolt(origin: foe.pos, dir: swarmNorm(dir + side * yaw), speed: 13, life: 3.2, player: false, damage: 12, radius: 0.7, blast: false, featured: false)
            }
        case .lancer:
            let side = simd_float3(dir.z, 0, -dir.x)
            for index in -1...2 {
                let origin = foe.pos + side * Float(index) * 2.4
                spawnBolt(origin: origin, dir: simd_float3(0, 0, 1), speed: 12, life: 3.4, player: false, damage: 14, radius: 0.7, blast: false, featured: false)
            }
        case .ring:
            let gap = Int(foe.age * 1.3) % 8
            for index in 0..<10 where abs(index - gap) > 1 && abs(index - gap - 10) > 1 {
                let ang = Float(index) / 10 * Float.pi * 2
                let d = simd_float3(sin(ang), 0, cos(ang))
                spawnBolt(origin: foe.pos, dir: d, speed: 11, life: 3.6, player: false, damage: 12, radius: 0.65, blast: false, featured: false)
            }
        case .boss:
            if Int(foe.age) % 2 == 0 {
                startBeam(from: foe.pos, dir: dir)
            } else {
                let gap = Int(foe.age) % 12
                for index in 0..<14 where abs(index - gap) > 1 {
                    let ang = Float(index) / 14 * Float.pi * 2
                    spawnBolt(origin: foe.pos, dir: simd_float3(sin(ang), 0, cos(ang)), speed: 10, life: 4, player: false, damage: 16, radius: 0.75, blast: false, featured: false)
                }
            }
        }
    }

    private func startBeam(from origin: simd_float3, dir: simd_float3) {
        let end = origin + swarmNorm(dir) * 28
        let box = SCNBox(width: 2.4, height: 0.25, length: 28, chamferRadius: 0)
        box.materials = [glow(UIColor(red: 1, green: 0.2, blue: 0.1, alpha: 1), intensity: 0.45, alpha: 0.28)]
        let node = SCNNode(geometry: box)
        node.simdPosition = (origin + end) * 0.5
        node.simdOrientation = swarmLook(forward: swarmNorm(dir), up: simd_float3(0, 1, 0))
        scene.rootNode.addChildNode(node)
        beams.append(Beam(node: node, origin: origin, dir: swarmNorm(dir), age: 0))
    }

    private func updateBeams(_ dt: Float) {
        var keep: [Beam] = []
        for var beam in beams {
            beam.age += dt
            let hot = beam.age > 0.55 && beam.age < 0.82
            if let mat = beam.node.geometry?.materials.first {
                mat.emission.intensity = hot ? 1.8 : 0.4
                mat.transparency = hot ? 0.15 : 0.55
            }
            if hot && iframes <= 0 {
                let along = simd_dot(pos - beam.origin, beam.dir)
                let closest = beam.origin + beam.dir * max(0, min(28, along))
                if simd_distance(closest, pos) < 1.7 {
                    hull -= 18
                    iframes = 0.4
                    flash = 1
                    audio.impact()
                    buzz.append(.hurt)
                }
            }
            if beam.age > 0.95 {
                beam.node.removeFromParentNode()
            } else {
                keep.append(beam)
            }
        }
        beams = keep
    }

    private func spawnWave(_ dt: Float) {
        guard phase == .run else { return }
        if !bossSpawned && simTime > 46 {
            bossSpawned = true
            spawnFoe(kind: .boss, at: simd_float3(0, 0, -22))
        }
        let alive = foes.filter { $0.alive && $0.kind != .boss }.count
        guard alive < 5 else { return }
        spawnTimer -= dt
        guard spawnTimer <= 0 else { return }
        let kind: FoeKind
        if simTime < 14 {
            kind = .drone
            spawnTimer = 2.6
        } else if simTime < 30 {
            kind = simTime.truncatingRemainder(dividingBy: 5) < 2.5 ? .lancer : .drone
            spawnTimer = 2.1
        } else {
            let roll = simTime.truncatingRemainder(dividingBy: 6)
            kind = roll < 2 ? .ring : (roll < 4 ? .lancer : .drone)
            spawnTimer = 1.7
        }
        let edge = foes.count % 3
        let at: simd_float3
        if edge == 0 {
            at = simd_float3(Float((foes.count % 5) - 2) * 2.4, 0, -24)
        } else if edge == 1 {
            at = simd_float3(-8.5, 0, -14 - Float(foes.count % 4) * 2.2)
        } else {
            at = simd_float3(8.5, 0, -12 - Float(foes.count % 4) * 2.2)
        }
        spawnFoe(kind: kind, at: at)
    }

    private func spawnFoe(kind: FoeKind, at point: simd_float3) {
        let node = SCNNode()
        let body = foeBody(kind)
        node.addChildNode(body)
        let ring = SCNTorus(ringRadius: kind == .boss ? 3.2 : 1.5, pipeRadius: kind == .boss ? 0.12 : 0.06)
        ring.ringSegmentCount = 24
        ring.pipeSegmentCount = 8
        ring.materials = [glow(UIColor(red: 1, green: 0.16, blue: 0.08, alpha: 1), intensity: 1.3, alpha: 0.15)]
        let marker = SCNNode(geometry: ring)
        marker.eulerAngles.x = .pi / 2
        marker.simdPosition = simd_float3(0, kind == .boss ? 2.4 : 1.5, 0)
        node.addChildNode(marker)
        node.simdPosition = point
        scene.rootNode.addChildNode(node)
        let hull: Float
        let radius: Float
        switch kind {
        case .drone: hull = 58; radius = 1.5
        case .lancer: hull = 70; radius = 1.6
        case .ring: hull = 84; radius = 1.7
        case .boss: hull = 620; radius = 3.4
        }
        let foe = Foe(node: node, body: body, pos: point, hull: hull, kind: kind, radius: radius)
        if kind == .lancer {
            foe.vel = simd_float3(point.x < 0 ? 7 : -7, 0, 1.5)
        }
        foes.append(foe)
    }

    private func foeBody(_ kind: FoeKind) -> SCNNode {
        let mat = glow(UIColor(red: 1, green: 0.18, blue: 0.1, alpha: 1), intensity: 1.1, alpha: 0)
        mat.lightingModel = .physicallyBased
        mat.diffuse.contents = UIColor(red: 0.18, green: 0.02, blue: 0.02, alpha: 1)
        mat.metalness.contents = 0.6
        mat.roughness.contents = 0.35
        let root = SCNNode()
        let nose = SCNPyramid(width: 1.2, height: 2.4, length: 1.2)
        nose.materials = [mat]
        let noseNode = SCNNode(geometry: nose)
        noseNode.eulerAngles.x = .pi / 2
        noseNode.simdPosition = simd_float3(0, 0, -0.4)
        root.addChildNode(noseNode)
        let hullMat = (art.hullDark.copy() as? SCNMaterial) ?? SCNMaterial()
        hullMat.multiply.contents = UIColor(red: 0.45, green: 0.08, blue: 0.06, alpha: 1)
        let box = SCNBox(width: 1.8, height: 0.55, length: 2.2, chamferRadius: 0.08)
        box.materials = [hullMat]
        let body = SCNNode(geometry: box)
        body.simdPosition = simd_float3(0, 0, 0.8)
        root.addChildNode(body)
        if kind == .boss {
            root.simdScale = simd_float3(repeating: 2.15)
        }
        return root
    }

    private func dropWreck(at point: simd_float3) {
        let kind = nextPart
        nextPart = kind == .turret ? .plate : (kind == .plate ? .engine : .turret)
        let node = wreckNode(kind)
        node.simdPosition = point
        scene.rootNode.addChildNode(node)
        wrecks.append(Wreck(node: node, pos: point, kind: kind, age: 0))
        if wrecks.count > 6 {
            wrecks.removeFirst().node.removeFromParentNode()
        }
    }

    private func wreckNode(_ kind: PartKind) -> SCNNode {
        let root = SCNNode()
        switch kind {
        case .turret:
            let barrel = SCNCylinder(radius: 0.16, height: 1.8)
            barrel.materials = [(art.hullDark.copy() as? SCNMaterial) ?? SCNMaterial()]
            let node = SCNNode(geometry: barrel)
            node.eulerAngles.x = .pi / 2
            root.addChildNode(node)
            let tip = SCNSphere(radius: 0.22)
            tip.materials = [glow(UIColor(red: 1, green: 0.55, blue: 0.15, alpha: 1), intensity: 1.4, alpha: 0)]
            let tipNode = SCNNode(geometry: tip)
            tipNode.simdPosition = simd_float3(0, 0, -1.0)
            root.addChildNode(tipNode)
        case .plate:
            let box = SCNBox(width: 1.6, height: 0.16, length: 0.9, chamferRadius: 0.04)
            let mat = (art.hullWorn.copy() as? SCNMaterial) ?? SCNMaterial()
            mat.emission.contents = UIColor(red: 1, green: 0.82, blue: 0.4, alpha: 1)
            mat.emission.intensity = 0.4
            box.materials = [mat]
            root.addChildNode(SCNNode(geometry: box))
        case .engine:
            let can = SCNCylinder(radius: 0.28, height: 1.1)
            can.materials = [(art.hullDark.copy() as? SCNMaterial) ?? SCNMaterial()]
            let node = SCNNode(geometry: can)
            node.eulerAngles.x = .pi / 2
            root.addChildNode(node)
            let glowBall = SCNSphere(radius: 0.24)
            glowBall.materials = [glow(UIColor(red: 0.35, green: 0.9, blue: 1, alpha: 1), intensity: 1.6, alpha: 0)]
            let g = SCNNode(geometry: glowBall)
            g.simdPosition = simd_float3(0, 0, 0.7)
            root.addChildNode(g)
        }
        return root
    }

    private func updateWrecks(_ dt: Float) {
        var keep: [Wreck] = []
        for var wreck in wrecks {
            wreck.age += dt
            wreck.pos.y = sin(wreck.age * 2.2) * 0.25
            wreck.node.simdPosition = wreck.pos
            if simd_distance(simd_float2(wreck.pos.x, wreck.pos.z), simd_float2(pos.x, pos.z)) < 3.3 {
                boltOn(wreck)
            } else if wreck.age < 18 {
                keep.append(wreck)
            } else {
                wreck.node.removeFromParentNode()
            }
        }
        wrecks = keep
    }

    private func boltOn(_ wreck: Wreck) {
        wreck.node.removeFromParentNode()
        let socket = socket(for: wreck.kind)
        let part = wreckNode(wreck.kind)
        part.simdPosition = socket
        part.simdScale = simd_float3(repeating: 0.05)
        ship.addChildNode(part)
        growParts.append(part)
        switch wreck.kind {
        case .turret: turrets += 1
        case .plate:
            plates += 1
            hullMax += 18
            hull = min(hullMax, hull + 18)
        case .engine: engines += 1
        }
        score += 80
        flash = max(flash, 0.4)
        audio.chime()
        buzz.append(.bolt)
    }

    private var growParts: [SCNNode] = []

    private func socket(for kind: PartKind) -> simd_float3 {
        switch kind {
        case .turret:
            let spots = [
                simd_float3(0, 1.15, -5.4),
                simd_float3(-5.1, 0.45, -0.2),
                simd_float3(5.1, 0.45, -0.2),
                simd_float3(0, 1.3, 0.8),
            ]
            return spots[turrets % spots.count]
        case .plate:
            let spots = [
                simd_float3(-2.3, 0.9, 0.4),
                simd_float3(2.3, 0.9, 0.4),
                simd_float3(0, 1.05, 2.4),
            ]
            return spots[plates % spots.count]
        case .engine:
            let spots = [
                simd_float3(-2.0, 0.35, 4.5),
                simd_float3(2.0, 0.35, 4.5),
                simd_float3(0, 0.9, 4.8),
            ]
            return spots[engines % spots.count]
        }
    }

    private func updateBits(_ dt: Float) {
        let clock = max(dt, 1.0 / 60)
        for node in growParts {
            let s = min(1, node.simdScale.x + clock * 4.5)
            node.simdScale = simd_float3(repeating: s)
        }
        growParts.removeAll { $0.simdScale.x >= 1 }
        var keep: [Bit] = []
        for var bit in bits {
            bit.life -= clock
            bit.vel.y -= 4 * clock
            bit.pos += bit.vel * clock
            bit.node.simdPosition = bit.pos
            bit.node.opacity = CGFloat(max(0, bit.life))
            if bit.life > 0 {
                keep.append(bit)
            } else {
                bit.node.removeFromParentNode()
            }
        }
        bits = keep
        boomLight.light?.intensity = CGFloat(flash * 1800)
        boomLight.simdPosition = pos + simd_float3(0, 1.2, -2)
    }

    private func explode(at point: simd_float3, power: Float) {
        audio.explosion(power: power)
        buzz.append(.boom)
        flash = max(flash, 0.85)
        let count = power > 1.2 ? 10 : 7
        for index in 0..<count {
            let s = CGFloat(0.25 + Float(index % 3) * 0.18)
            let box = SCNBox(width: s, height: s * 0.7, length: s * 1.3, chamferRadius: 0.04)
            box.materials = [art.debris]
            let node = SCNNode(geometry: box)
            node.simdPosition = point
            scene.rootNode.addChildNode(node)
            let ang = Float(index) / Float(count) * Float.pi * 2
            let vel = simd_float3(cos(ang) * 8, Float(3 + index % 3), sin(ang) * 8)
            bits.append(Bit(node: node, pos: point, vel: vel, life: 0.8))
        }
    }

    private func spark(at point: simd_float3) {
        for index in 0..<4 {
            let sphere = SCNSphere(radius: 0.12)
            sphere.materials = [glow(UIColor(red: 1, green: 0.85, blue: 0.55, alpha: 1), intensity: 1.5, alpha: 0)]
            let node = SCNNode(geometry: sphere)
            node.simdPosition = point
            scene.rootNode.addChildNode(node)
            let ang = Float(index) * 1.6
            bits.append(Bit(node: node, pos: point, vel: simd_float3(cos(ang) * 6, 2, sin(ang) * 6), life: 0.22))
        }
    }

    private func showPip(at point: simd_float3) {
        let eye = point + simd_float3(8, 4, 6)
        let dir = swarmNorm(point - eye)
        pipNode.simdPosition = eye
        pipNode.simdOrientation = swarmLook(forward: dir, up: simd_float3(0, 1, 0))
        pipLeft = 0.55
    }

    private func beginCam(from origin: simd_float3, to target: simd_float3, seconds: Float) {
        let mid = (origin + target) * 0.5
        camAnchor = target
        camEye = simd_float3(mid.x + 18, max(4, mid.y + 7), mid.z + 1)
        let forward = swarmNorm(target + simd_float3(0, 0.6, 0) - camEye)
        camQuat = levelLook(forward: forward, fallbackRight: simd_float3(0, 0, 1))
        camHold = true
        camLeft = seconds
        camAge = 0.01
        posed = false
        logMark("NR2 shotcam \(cockpit ? "cockpit" : "command")")
    }

    private func endCam() {
        camHold = false
        camLeft = 0
        camAge = 0
        camGap = 0.2
        posed = false
    }

    private func bumpShake(_ amount: Float) {
        shake = min(1, max(shake, amount))
    }

    private func offerCardIfDue() {
        let mark: Float?
        if simTime >= 15 && !dealt15 {
            mark = 15
        } else if simTime >= 30 && !dealt30 {
            mark = 30
        } else if simTime >= 45 && !dealt45 {
            mark = 45
        } else {
            mark = nil
        }
        guard let mark, !camHold else { return }
        if mark == 15 { dealt15 = true }
        if mark == 30 { dealt30 = true }
        if mark == 45 { dealt45 = true }
        var bag = [0, 1, 2, 3, 4, 5]
        bag.shuffle()
        let names = [
            ("RAPID FIRE", "Shots come faster"),
            ("WIDE SPREAD", "The volley opens up"),
            ("HEAVY BOLTS", "Each hit hits harder"),
            ("SHIELD BURST", "Heal and raise the hull"),
            ("LONG RANGE", "Bolts reach farther"),
            ("QUICK DASH", "Dash again sooner"),
        ]
        offered = bag.prefix(3).map { id in
            CardOffer(title: names[id].0, detail: names[id].1, apply: id)
        }
        cardReal = 0
        phase = .cards
    }

    private func finish() {
        guard phase != .results else { return }
        phase = .results
        endCam()
        if !markedResults {
            markedResults = true
            logMark("NR2 phase results")
        }
    }

    private func updateCamera() {
        let gameplayCockpit = cockpit && phase != .results
        if camHold {
            if !posed {
                cameraNode.simdOrientation = camQuat
                cameraNode.camera?.fieldOfView = 48
                posed = true
                poseCockpit = false
            }
            let dolly = min(2.2, camAge * 1.05)
            var away = simd_float3(camEye.x - camAnchor.x, 0, camEye.z - camAnchor.z)
            if simd_length(away) < 0.2 { away = simd_float3(1, 0, 0) }
            away = swarmNorm(away)
            cameraNode.simdPosition = camEye + away * dolly + shakeOffset(scale: 0.6)
            lockRing.isHidden = true
            return
        }
        if !posed || poseCockpit != gameplayCockpit {
            cameraNode.simdOrientation = gameplayCockpit ? cockpitQuat : commandQuat
            posed = true
            poseCockpit = gameplayCockpit
        }
        if gameplayCockpit {
            cameraNode.camera?.fieldOfView = 62
            cameraNode.simdPosition = pos + simd_float3(0, 1.85, 1.15) + shakeOffset(scale: 0.16)
        } else {
            let height: Float
            let focusZ: Float
            let fov: CGFloat
            if phase == .gate {
                height = 18
                focusZ = pos.z - 0.5
                fov = 40
            } else if phase == .results {
                height = 34
                focusZ = pos.z - 1
                fov = 46
            } else {
                height = 48
                focusZ = pos.z - 7
                fov = 52
            }
            cameraNode.camera?.fieldOfView = fov
            cameraNode.simdPosition = simd_float3(pos.x, height, focusZ) + shakeOffset(scale: 1.6)
        }
        lockRing.isHidden = !locked || phase != .run
        if let lockWorld {
            lockRing.simdPosition = lockWorld + simd_float3(0, 0.4, 0)
        }
    }

    /// Position kick only. The orientation above is never nudged, so the horizon cannot roll.
    private func shakeOffset(scale: Float) -> simd_float3 {
        let mag = shake * scale
        return simd_float3(sin(shakePhase * 51) * mag, 0, cos(shakePhase * 43) * mag)
    }

    private func poseAimLine(from origin: simd_float3, dir: simd_float3, hot: Bool) {
        aimLine.simdPosition = origin + dir * 11
        aimLine.simdOrientation = swarmLook(forward: dir, up: simd_float3(0, 1, 0))
        aimLine.isHidden = phase != .run
        aimMat.emission.intensity = hot ? 1.3 : 0.45
        aimMat.diffuse.contents = locked
            ? UIColor(red: 1, green: 0.95, blue: 0.85, alpha: 1)
            : UIColor(red: 0.55, green: 0.95, blue: 1, alpha: 1)
    }

    private func foeAlong(_ dir: simd_float3, from origin: simd_float3) -> Foe? {
        var best: Foe?
        var bestDist = Float.greatestFiniteMagnitude
        for foe in foes where foe.alive {
            let to = foe.pos - origin
            let along = simd_dot(to, dir)
            if along < 2 || along > 52 + rangeRank * 8 { continue }
            let closest = origin + dir * along
            if simd_distance(closest, foe.pos) < foe.radius + 2.6 && along < bestDist {
                best = foe
                bestDist = along
            }
        }
        return best
    }

    private func showcaseDrive() {
        var move = simd_float2.zero
        if let wreck = wrecks.min(by: { simd_distance($0.pos, pos) < simd_distance($1.pos, pos) }) {
            let dx = wreck.pos.x - pos.x
            let dz = wreck.pos.z - pos.z
            move = simd_float2(max(-1, min(1, dx / 6)), max(-1, min(1, -dz / 6)))
        }
        if let threat = bolts.filter({ !$0.player }).min(by: { simd_distance($0.pos, pos) < simd_distance($1.pos, pos) }) {
            let dist = simd_distance(threat.pos, pos)
            if dist < 8 {
                let away = simd_float3(pos.x - threat.pos.x, 0, pos.z - threat.pos.z)
                let len = simd_length(away)
                if len > 0.01 {
                    let world = away / len
                    move = simd_float2(world.x, -world.z)
                }
                if dist < 3.4 && dashCool <= 0 {
                    updatePad { pad in
                        pad.dash = simd_float3(pos.x - threat.pos.x, 0, pos.z - threat.pos.z)
                        pad.dashOn = true
                    }
                }
            }
        }
        if simd_length(simd_float2(pos.x, pos.z)) > 7.4 {
            move = simd_float2(move.x - pos.x * 0.12, move.y + pos.z * 0.08)
        }
        var aim = simd_float2.zero
        var aimOn = false
        if let foe = foes.filter({ $0.alive }).min(by: { simd_distance($0.pos, pos) < simd_distance($1.pos, pos) }) {
            let flat = foe.pos - simd_float3(pos.x, 0, pos.z)
            if cockpit {
                let to = swarmNorm(foe.pos - simd_float3(pos.x, 0.6, pos.z))
                if to.z < -0.15 {
                    let k = -1 / to.z
                    aim = simd_float2(max(-1, min(1, to.x * k / 0.55)), max(-1, min(1, to.y * k / 0.10)))
                    aimOn = true
                }
            } else if simd_length(flat) > 0.4 {
                let dir = swarmNorm(simd_float3(flat.x, 0, flat.z))
                aim = simd_float2(max(-1, min(1, dir.x)), max(-1, min(1, -dir.z)))
                aimOn = true
            }
        }
        let release = charge > 0.9 && Int(simTime * 2) % 7 == 0
        let toss = aimOn && torpedoCool <= 0 && Int(simTime) % 5 == 0 && simTime > 6
        updatePad { pad in
            pad.move = move
            pad.moveOn = simd_length(move) > 0.05
            pad.aim = aim
            pad.aimOn = aimOn && !release
            if release { pad.release = true }
            if toss { pad.torpedo = true }
        }
    }

    private func peekPad() -> SwarmPad {
        lock.lock()
        let copy = pad
        lock.unlock()
        return copy
    }

    private func consumePad() -> SwarmPad {
        lock.lock()
        var copy = pad
        pad.release = false
        pad.dashOn = false
        pad.skip = false
        pad.torpedo = false
        lock.unlock()
        return copy
    }

    private func publish() {
        var snap = SwarmSnap()
        snap.phase = phase
        snap.remain = max(0, 60 - simTime)
        snap.health = max(0, hull)
        snap.healthMax = hullMax
        snap.score = score
        snap.graze = grazeLeft > 0 ? grazeText : ""
        snap.grazeAlpha = min(1, grazeLeft / 0.7)
        snap.flash = flash
        snap.aimPoint = phase == .run ? aimWorld : nil
        snap.lockPoint = locked ? lockWorld : nil
        snap.locked = locked && !camHold
        snap.shotCam = camHold
        snap.cardTitles = offered.map(\.title)
        snap.cardDetails = offered.map(\.detail)
        snap.parts = turrets + plates + engines
        snap.survived = simTime
        snap.cleared = cleared
        snap.buzz = buzz
        snap.cockpit = cockpit
        let send = snap
        let pip = pipLeft > 0 && !camHold
        DispatchQueue.main.async { [weak self] in
            self?.onSnap?(send)
            self?.pipVisible?(pip)
        }
    }

    var pipVisible: ((Bool) -> Void)?
    private var playQueued = false
    private var pickQueued = -1

    func choose(_ index: Int) {
        lock.lock()
        pickQueued = index
        lock.unlock()
    }

    func pressPlay() {
        lock.lock()
        playQueued = true
        lock.unlock()
    }

    private func takeCommands() -> (play: Bool, pick: Int) {
        lock.lock()
        let play = playQueued
        let pick = pickQueued
        playQueued = false
        pickQueued = -1
        lock.unlock()
        return (play, pick)
    }

    private func buildScene() {
        scene.background.contents = art.sky
        scene.lightingEnvironment.contents = art.sky
        scene.lightingEnvironment.intensity = 0.55
        let camera = SCNCamera()
        camera.wantsHDR = true
        camera.wantsExposureAdaptation = false
        camera.exposureOffset = 0.15
        camera.bloomIntensity = 0.42
        camera.bloomThreshold = 0.72
        camera.bloomBlurRadius = 6
        camera.fieldOfView = 66
        camera.zNear = 0.08
        camera.zFar = 8000
        camera.motionBlurIntensity = 0
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)
        let shot = SCNCamera()
        shot.wantsHDR = true
        shot.bloomIntensity = 0.5
        shot.bloomThreshold = 0.7
        shot.fieldOfView = 52
        shot.zNear = 0.08
        shot.zFar = 8000
        shotNode.camera = shot
        scene.rootNode.addChildNode(shotNode)
        let pip = SCNCamera()
        pip.fieldOfView = 42
        pip.zNear = 0.08
        pip.zFar = 4000
        pipNode.camera = pip
        scene.rootNode.addChildNode(pipNode)

        let sun = SCNNode()
        sun.light = SCNLight()
        sun.light?.type = .directional
        sun.light?.intensity = 1700
        sun.light?.temperature = 5800
        sun.light?.color = UIColor(red: 1, green: 0.96, blue: 0.9, alpha: 1)
        sun.simdPosition = SpaceLook.sunDirection * 200
        sun.simdOrientation = swarmLook(forward: -SpaceLook.sunDirection, up: simd_float3(0, 1, 0))
        scene.rootNode.addChildNode(sun)
        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .ambient
        fill.light?.intensity = 28
        fill.light?.color = UIColor(red: 0.55, green: 0.62, blue: 0.75, alpha: 1)
        scene.rootNode.addChildNode(fill)
        boomLight.light = SCNLight()
        boomLight.light?.type = .omni
        boomLight.light?.intensity = 0
        boomLight.light?.color = UIColor(red: 1, green: 0.72, blue: 0.4, alpha: 1)
        boomLight.light?.attenuationEndDistance = 28
        scene.rootNode.addChildNode(boomLight)

        player.addChildNode(ship)
        player.simdScale = simd_float3(repeating: 0.70)
        scene.rootNode.addChildNode(player)

        let line = SCNBox(width: 0.08, height: 0.08, length: 22, chamferRadius: 0)
        aimMat = glow(UIColor(red: 0.55, green: 0.95, blue: 1, alpha: 1), intensity: 0.7, alpha: 0.35)
        line.materials = [aimMat]
        aimLine.geometry = line
        scene.rootNode.addChildNode(aimLine)
        let ring = SCNTorus(ringRadius: 1.7, pipeRadius: 0.07)
        ring.ringSegmentCount = 28
        ring.pipeSegmentCount = 8
        ring.materials = [glow(UIColor.white, intensity: 1.5, alpha: 0.1)]
        lockRing.geometry = ring
        lockRing.eulerAngles.x = .pi / 2
        lockRing.isHidden = true
        scene.rootNode.addChildNode(lockRing)

        scene.rootNode.addChildNode(Meshes.planet(art: art))
        scene.rootNode.addChildNode(Meshes.world("earth", radius: 90, at: simd_float3(-180, 36, -520), air: UIColor(red: 0.45, green: 0.7, blue: 1, alpha: 1)))
        scene.rootNode.addChildNode(Meshes.world("mars", radius: 120, at: simd_float3(220, 50, -680), air: UIColor(red: 0.85, green: 0.45, blue: 0.28, alpha: 1)))
        scene.rootNode.addChildNode(Meshes.sun(art: art))
        updateCamera()
    }

    /// `fade` of 0 is a solid glow. A small fade is a faint additive streak.
    private func glow(_ color: UIColor, intensity: CGFloat, alpha fade: CGFloat) -> SCNMaterial {
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.diffuse.contents = color
        mat.emission.contents = color
        mat.emission.intensity = intensity
        if fade <= 0.02 {
            mat.transparency = 1
        } else {
            mat.transparency = min(0.92, 0.55 + fade)
            mat.blendMode = .add
            mat.writesToDepthBuffer = false
        }
        mat.isDoubleSided = true
        return mat
    }
}

private final class Foe {
    var node: SCNNode
    var body: SCNNode
    var pos: simd_float3
    var vel = simd_float3.zero
    var hull: Float
    var kind: FoeKind
    var radius: Float
    var cooldown: Float = 0.8
    var windup: Float = 0
    var windupDir = simd_float3(0, 0, 1)
    var age: Float = 0
    var alive = true
    var flash: Float = 0
    var telegraph: SCNNode?
    init(node: SCNNode, body: SCNNode, pos: simd_float3, hull: Float, kind: FoeKind, radius: Float) {
        self.node = node
        self.body = body
        self.pos = pos
        self.hull = hull
        self.kind = kind
        self.radius = radius
    }
}

private struct Bolt {
    var node: SCNNode
    var pos: simd_float3
    var vel: simd_float3
    var life: Float
    var player: Bool
    var damage: Float
    var radius: Float
    var grazed: Bool
    var blast: Bool
    var featured: Bool
    var torpedo: Bool
}

private struct Wreck {
    var node: SCNNode
    var pos: simd_float3
    var kind: PartKind
    var age: Float
}

private struct Bit {
    var node: SCNNode
    var pos: simd_float3
    var vel: simd_float3
    var life: Float
}

private struct Beam {
    var node: SCNNode
    var origin: simd_float3
    var dir: simd_float3
    var age: Float
}

final class SalvageSwarmViewController: UIViewController {
    private let scnView = SCNView()
    private let pipView = SCNView()
    private let audio = FlightAudio()
    private let haptics = FlightHaptics()
    private let motion = CMMotionManager()
    private var world: SalvageWorld!
    private let showcase: Bool
    private var shown: SwarmPhase = .gate
    private var shotCam = false
    private var moveTouch: UITouch?
    private var aimTouch: UITouch?
    private var moveOrigin = CGPoint.zero
    private var aimOrigin = CGPoint.zero
    private var moveSamples: [(TimeInterval, CGPoint)] = []
    private var appliedScale: CGFloat = 0
    private var lastOrientationLog = ""
    private var requestedOrientation = false
    private var tiltOn = UserDefaults.standard.bool(forKey: "nr2.swarm.tilt")
    private var shotEvery = UserDefaults.standard.string(forKey: "nr2.swarm.shotcam") == "every"
    private var cockpitOn = UserDefaults.standard.string(forKey: "nr2.swarm.view") == "cockpit"

    private let flashView = UIView()
    private let titleLabel = UILabel()
    private let subLabel = UILabel()
    private let timerLabel = UILabel()
    private let scoreLabel = UILabel()
    private let grazeLabel = UILabel()
    private let cameraLabel = UILabel()
    private let healthTrack = UIView()
    private let healthFill = UIView()
    private let cross = UIView()
    private let lockBox = UIView()
    private let tiltButton = UIButton(type: .system)
    private let viewButton = UIButton(type: .system)
    private let camButton = UIButton(type: .system)
    private let torpedoButton = UIButton(type: .system)
    private let playButton = UIButton(type: .system)
    private let againButton = UIButton(type: .system)
    private let classicButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private var cardButtons: [UIButton] = []
    private let resultLabel = UILabel()

    init() {
        let args = ProcessInfo.processInfo.arguments
        let env = ProcessInfo.processInfo.environment
        showcase = args.contains("-showcase") || env["NR2_SHOWCASE"] == "1"
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        logLine("NR2 swarm view")
        view.backgroundColor = .black
        world = SalvageWorld(audio: audio, showcase: showcase)
        world.onSnap = { [weak self] snap in self?.apply(snap) }
        world.pipVisible = { [weak self] visible in
            self?.pipView.isHidden = !visible
        }
        scnView.frame = view.bounds
        scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scnView.scene = world.scene
        scnView.pointOfView = world.cameraNode
        scnView.backgroundColor = .black
        scnView.antialiasingMode = .multisampling2X
        scnView.preferredFramesPerSecond = 60
        scnView.rendersContinuously = true
        scnView.autoenablesDefaultLighting = false
        scnView.delegate = world
        view.addSubview(scnView)

        pipView.scene = world.scene
        pipView.pointOfView = world.pipNode
        pipView.isHidden = true
        pipView.isUserInteractionEnabled = false
        pipView.layer.borderWidth = 1
        pipView.layer.borderColor = UIColor(red: 0.6, green: 0.95, blue: 1, alpha: 0.8).cgColor
        pipView.layer.cornerRadius = 8
        pipView.clipsToBounds = true
        view.addSubview(pipView)

        flashView.backgroundColor = .white
        flashView.alpha = 0
        flashView.isUserInteractionEnabled = false
        view.addSubview(flashView)

        style(titleLabel, size: 28, weight: .ultraLight, align: .center)
        titleLabel.text = "SALVAGE SWARM"
        style(subLabel, size: 13, weight: .regular, align: .center)
        subLabel.numberOfLines = 3
        subLabel.text = "Command Center looks down on the fight. Aim with the right thumb.\nPhoton torpedo is the heavy shot. Flick the left thumb to dash."
        style(timerLabel, size: 22, weight: .medium, align: .center)
        style(scoreLabel, size: 16, weight: .semibold, align: .left)
        style(grazeLabel, size: 28, weight: .heavy, align: .center)
        grazeLabel.textColor = UIColor(red: 0.7, green: 1, blue: 0.85, alpha: 1)
        style(cameraLabel, size: 13, weight: .semibold, align: .center)
        cameraLabel.textColor = UIColor(red: 0.65, green: 0.95, blue: 1, alpha: 1)
        cameraLabel.text = "COMMAND CENTER"
        style(resultLabel, size: 22, weight: .semibold, align: .center)
        resultLabel.numberOfLines = 5
        healthTrack.backgroundColor = UIColor(white: 1, alpha: 0.16)
        healthTrack.isUserInteractionEnabled = false
        healthFill.backgroundColor = UIColor(red: 0.35, green: 0.95, blue: 0.75, alpha: 1)
        healthFill.isUserInteractionEnabled = false
        healthTrack.addSubview(healthFill)
        configure(tiltButton, title: tiltTitle(), action: #selector(toggleTilt))
        configure(viewButton, title: viewTitle(), action: #selector(toggleView))
        configure(camButton, title: camTitle(), action: #selector(toggleCam))
        configure(torpedoButton, title: "PHOTON TORPEDO", action: #selector(fireTorpedo))
        torpedoButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .heavy)
        configure(playButton, title: "PLAY", action: #selector(play))
        playButton.titleLabel?.font = UIFont.systemFont(ofSize: 22, weight: .heavy)
        configure(againButton, title: "PLAY AGAIN", action: #selector(replay))
        againButton.titleLabel?.font = UIFont.systemFont(ofSize: 22, weight: .heavy)
        configure(classicButton, title: "CLASSIC FLIGHT", action: #selector(classic))
        configure(skipButton, title: "SKIP", action: #selector(skipCam))
        buildCross()
        for item in [titleLabel, subLabel, timerLabel, scoreLabel, grazeLabel, cameraLabel, resultLabel, healthTrack, cross, lockBox, tiltButton, viewButton, camButton, torpedoButton, playButton, againButton, classicButton, skipButton] {
            view.addSubview(item)
        }
        againButton.isHidden = true
        resultLabel.isHidden = true
        skipButton.isHidden = true
        torpedoButton.isHidden = true
        cameraLabel.isHidden = true
        timerLabel.isHidden = true
        scoreLabel.isHidden = true
        healthTrack.isHidden = true
        if tiltOn { startTilt() }
        pushSettings()
        logLine("NR2 swarm ready")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        requestShowcaseOrientation()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let b = view.bounds
        scnView.frame = b
        flashView.frame = b
        let scale = hudScale
        let safe = view.safeAreaInsets
        pipView.frame = CGRect(x: b.width - 132 * scale, y: safe.top + 54 * scale, width: 112 * scale, height: 150 * scale)
        titleLabel.frame = CGRect(x: 16, y: safe.top + 18 * scale, width: b.width - 32, height: 40 * scale)
        subLabel.frame = CGRect(x: 24, y: titleLabel.frame.maxY, width: b.width - 48, height: 64 * scale)
        timerLabel.frame = CGRect(x: b.midX - 50 * scale, y: safe.top + 8, width: 100 * scale, height: 32 * scale)
        scoreLabel.frame = CGRect(x: 16, y: safe.top + 10, width: 140 * scale, height: 28 * scale)
        healthTrack.frame = CGRect(x: b.midX - 80 * scale, y: timerLabel.frame.maxY + 2, width: 160 * scale, height: 8 * scale)
        cameraLabel.frame = CGRect(x: 16, y: healthTrack.frame.maxY + 2, width: b.width - 32, height: 18 * scale)
        grazeLabel.frame = CGRect(x: 20, y: b.midY - 80, width: b.width - 40, height: 40)
        resultLabel.frame = CGRect(x: 20, y: safe.top + 24, width: b.width - 40, height: 150 * scale)
        let buttonW = min(b.width - 48, 340 * scale)
        let buttonX = (b.width - buttonW) / 2
        classicButton.frame = CGRect(x: buttonX, y: b.height - safe.bottom - 44 * scale, width: buttonW, height: 34 * scale)
        playButton.frame = CGRect(x: buttonX, y: classicButton.frame.minY - 68 * scale, width: buttonW, height: 58 * scale)
        camButton.frame = CGRect(x: buttonX, y: playButton.frame.minY - 52 * scale, width: buttonW, height: 44 * scale)
        viewButton.frame = CGRect(x: buttonX, y: camButton.frame.minY - 52 * scale, width: buttonW, height: 44 * scale)
        tiltButton.frame = CGRect(x: buttonX, y: viewButton.frame.minY - 52 * scale, width: buttonW, height: 44 * scale)
        torpedoButton.frame = CGRect(x: buttonX, y: b.height - safe.bottom - 62 * scale, width: buttonW, height: 52 * scale)
        againButton.frame = CGRect(x: buttonX, y: b.height * 0.62, width: buttonW, height: 68 * scale)
        skipButton.frame = CGRect(x: b.midX - 48 * scale, y: safe.top + 46 * scale, width: 96 * scale, height: 36 * scale)
        layoutCards(scale: scale, safe: safe)
        if abs(scale - appliedScale) > 0.02 {
            appliedScale = scale
            titleLabel.font = UIFont.systemFont(ofSize: 28 * scale, weight: .ultraLight)
            subLabel.font = UIFont.systemFont(ofSize: 13 * scale, weight: .regular)
            timerLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 22 * scale, weight: .medium)
            scoreLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 16 * scale, weight: .semibold)
            grazeLabel.font = UIFont.systemFont(ofSize: 28 * scale, weight: .heavy)
            resultLabel.font = UIFont.systemFont(ofSize: 22 * scale, weight: .semibold)
            playButton.titleLabel?.font = UIFont.systemFont(ofSize: 22 * scale, weight: .heavy)
            againButton.titleLabel?.font = UIFont.systemFont(ofSize: 22 * scale, weight: .heavy)
        }
        logOrientation(b)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard shown == .run else { return }
        for touch in touches {
            let p = touch.location(in: view)
            if shotCam && p.y < view.bounds.height * 0.28 { continue }
            if p.x < view.bounds.midX {
                moveTouch = touch
                moveOrigin = p
                moveSamples = [(touch.timestamp, p)]
            } else {
                aimTouch = touch
                aimOrigin = p
            }
        }
        syncSticks()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches where touch === moveTouch {
            let p = touch.location(in: view)
            moveSamples.append((touch.timestamp, p))
            moveSamples.removeAll { touch.timestamp - $0.0 > 0.16 }
            if let first = moveSamples.first {
                let dt = touch.timestamp - first.0
                let dx = p.x - first.1.x
                let dy = p.y - first.1.y
                let dist = hypot(dx, dy)
                if dt > 0.04 && dist > 32 && dist / CGFloat(dt) > 640 {
                    world.updatePad { pad in
                        pad.dash = simd_float3(Float(dx), 0, Float(dy))
                        pad.dashOn = true
                    }
                    moveSamples.removeAll()
                }
            }
        }
        syncSticks()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if shotCam && touch.location(in: view).y < view.bounds.height * 0.28 {
                world.updatePad { $0.skip = true }
            }
            if touch === aimTouch {
                world.updatePad { $0.release = true; $0.aimOn = false }
                aimTouch = nil
            }
            if touch === moveTouch {
                moveTouch = nil
                world.updatePad { $0.moveOn = false; $0.move = .zero }
            }
        }
        syncSticks()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        touchesEnded(touches, with: event)
    }

    private func syncSticks() {
        world.updatePad { pad in
            if let moveTouch {
                let p = moveTouch.location(in: self.view)
                let radius = CGFloat(78 * self.hudScale)
                pad.move = simd_float2(
                    Float(max(-1, min(1, (p.x - self.moveOrigin.x) / radius))),
                    Float(max(-1, min(1, -(p.y - self.moveOrigin.y) / radius)))
                )
                pad.moveOn = true
            }
            if let aimTouch {
                let p = aimTouch.location(in: self.view)
                let radius = CGFloat(84 * self.hudScale)
                pad.aim = simd_float2(
                    Float(max(-1, min(1, (p.x - self.aimOrigin.x) / radius))),
                    Float(max(-1, min(1, -(p.y - self.aimOrigin.y) / radius)))
                )
                pad.aimOn = hypot(p.x - self.aimOrigin.x, p.y - self.aimOrigin.y) > 16
            }
        }
    }

    private func apply(_ snap: SwarmSnap) {
        shown = snap.phase
        shotCam = snap.shotCam
        cockpitOn = snap.phase == .gate ? cockpitOn : snap.cockpit
        if scnView.pointOfView !== world.cameraNode {
            scnView.pointOfView = world.cameraNode
        }
        let gate = snap.phase == .gate
        let run = snap.phase == .run
        let cards = snap.phase == .cards
        let results = snap.phase == .results
        titleLabel.isHidden = !gate
        subLabel.isHidden = !gate
        tiltButton.isHidden = !gate
        viewButton.isHidden = !gate
        camButton.isHidden = !gate
        playButton.isHidden = !gate
        classicButton.isHidden = !(gate || results)
        torpedoButton.isHidden = !run
        cameraLabel.isHidden = !(run || cards)
        cameraLabel.text = snap.cockpit ? "COCKPIT" : "COMMAND CENTER"
        timerLabel.isHidden = !(run || cards)
        scoreLabel.isHidden = !(run || cards || results)
        healthTrack.isHidden = !(run || cards)
        againButton.isHidden = !results
        resultLabel.isHidden = !results
        skipButton.isHidden = !snap.shotCam
        grazeLabel.text = snap.graze
        grazeLabel.alpha = CGFloat(snap.grazeAlpha)
        let seconds = Int(snap.remain.rounded(.up))
        timerLabel.text = String(format: "0:%02d", max(0, seconds))
        scoreLabel.text = "\(snap.score)"
        let frac = snap.healthMax > 1 ? max(0, snap.health / snap.healthMax) : 0
        healthFill.frame = CGRect(x: 0, y: 0, width: healthTrack.bounds.width * CGFloat(frac), height: healthTrack.bounds.height)
        flashView.alpha = CGFloat(min(0.45, snap.flash * 0.35))
        if results {
            let time = Int(snap.survived.rounded())
            let headline = snap.cleared ? "MINUTE CLEARED" : "SHIP LOST"
            resultLabel.text = "\(headline)\nSCORE \(snap.score)\nTIME \(time)s\n\(snap.parts) PARTS BOLTED"
            scoreLabel.isHidden = true
        }
        placeCross(snap)
        rebuildCards(snap, show: cards)
        for buzz in snap.buzz { playBuzz(buzz) }
    }

    private func placeCross(_ snap: SwarmSnap) {
        let show = snap.phase == .run && snap.aimPoint != nil
        cross.isHidden = !show
        lockBox.isHidden = !(show && snap.locked && !snap.shotCam)
        guard show, let aim = snap.aimPoint else { return }
        let point: CGPoint
        if snap.shotCam {
            point = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
            cross.alpha = 0.35
        } else if let projected = project(aim) {
            point = projected
            cross.alpha = 1
        } else {
            cross.isHidden = true
            return
        }
        let size: CGFloat = 34 * hudScale
        cross.frame = CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)
        let thick: CGFloat = 2
        let arm = size * 0.28
        let arms = cross.subviews
        if arms.count == 4 {
            arms[0].frame = CGRect(x: (size - thick) / 2, y: 2, width: thick, height: arm)
            arms[1].frame = CGRect(x: (size - thick) / 2, y: size - arm - 2, width: thick, height: arm)
            arms[2].frame = CGRect(x: 2, y: (size - thick) / 2, width: arm, height: thick)
            arms[3].frame = CGRect(x: size - arm - 2, y: (size - thick) / 2, width: arm, height: thick)
        }
        if let lock = snap.lockPoint, let projected = project(lock), !snap.shotCam {
            let box: CGFloat = 58 * hudScale
            lockBox.frame = CGRect(x: projected.x - box / 2, y: projected.y - box / 2, width: box, height: box)
        }
    }

    private func project(_ worldPoint: simd_float3) -> CGPoint? {
        let p = scnView.projectPoint(SCNVector3(worldPoint.x, worldPoint.y, worldPoint.z))
        guard p.z >= 0, p.z < 1 else { return nil }
        return CGPoint(x: CGFloat(p.x), y: CGFloat(p.y))
    }

    private func rebuildCards(_ snap: SwarmSnap, show: Bool) {
        if !show {
            cardButtons.forEach { $0.isHidden = true }
            return
        }
        while cardButtons.count < snap.cardTitles.count {
            let button = UIButton(type: .system)
            button.titleLabel?.numberOfLines = 2
            button.titleLabel?.textAlignment = .center
            button.layer.borderWidth = 1
            button.layer.borderColor = UIColor(red: 0.7, green: 0.95, blue: 1, alpha: 0.9).cgColor
            button.backgroundColor = UIColor(white: 0.02, alpha: 0.72)
            button.setTitleColor(.white, for: .normal)
            button.addTarget(self, action: #selector(tapCard(_:)), for: .touchUpInside)
            view.addSubview(button)
            cardButtons.append(button)
        }
        for (index, button) in cardButtons.enumerated() {
            let on = index < snap.cardTitles.count
            button.isHidden = !on
            button.tag = index
            if on {
                button.setTitle("\(snap.cardTitles[index])\n\(snap.cardDetails[index])", for: .normal)
                button.titleLabel?.font = UIFont.systemFont(ofSize: 18 * hudScale, weight: .bold)
            }
        }
        layoutCards(scale: hudScale, safe: view.safeAreaInsets)
    }

    private func layoutCards(scale: CGFloat, safe: UIEdgeInsets) {
        let width = min(view.bounds.width - 36, 420 * scale)
        let x = (view.bounds.width - width) / 2
        var y = view.bounds.height * 0.34
        for button in cardButtons where !button.isHidden {
            button.frame = CGRect(x: x, y: y, width: width, height: 74 * scale)
            y += 84 * scale
        }
        _ = safe
    }

    private func playBuzz(_ buzz: SwarmBuzz) {
        switch buzz {
        case .shot: haptics.shot(0)
        case .dash: haptics.boom(power: 0.7)
        case .blast: haptics.boom(power: 1)
        case .graze: haptics.shot(1)
        case .bolt: haptics.boom(power: 0.85)
        case .hurt: haptics.hit()
        case .boom: haptics.boom(power: 1)
        case .torpedo: haptics.boom(power: 1)
        case .tap: haptics.shot(2)
        }
    }

    private func buildCross() {
        cross.isUserInteractionEnabled = false
        lockBox.isUserInteractionEnabled = false
        lockBox.layer.borderWidth = 2
        lockBox.layer.borderColor = UIColor.white.cgColor
        lockBox.backgroundColor = .clear
        for _ in 0..<4 {
            let arm = UIView()
            arm.backgroundColor = UIColor(white: 0.96, alpha: 0.95)
            arm.isUserInteractionEnabled = false
            cross.addSubview(arm)
        }
    }

    @objc private func toggleTilt() {
        tiltOn.toggle()
        UserDefaults.standard.set(tiltOn, forKey: "nr2.swarm.tilt")
        tiltButton.setTitle(tiltTitle(), for: .normal)
        if tiltOn { startTilt() } else { motion.stopDeviceMotionUpdates() }
        pushSettings()
        haptics.shot(2)
    }

    @objc private func toggleView() {
        cockpitOn.toggle()
        UserDefaults.standard.set(cockpitOn ? "cockpit" : "command", forKey: "nr2.swarm.view")
        viewButton.setTitle(viewTitle(), for: .normal)
        pushSettings()
        haptics.shot(2)
    }

    @objc private func toggleCam() {
        shotEvery.toggle()
        UserDefaults.standard.set(shotEvery ? "every" : "kills", forKey: "nr2.swarm.shotcam")
        camButton.setTitle(camTitle(), for: .normal)
        pushSettings()
        haptics.shot(2)
    }

    @objc private func fireTorpedo() {
        world.updatePad { $0.torpedo = true }
    }

    @objc private func play() {
        haptics.boom(power: 0.6)
        pushSettings()
        world.pressPlay()
    }

    @objc private func replay() {
        leave(to: SalvageSwarmViewController())
    }

    @objc private func classic() {
        leave(to: FlightViewController())
    }

    @objc private func skipCam() {
        world.updatePad { $0.skip = true }
        haptics.shot(2)
    }

    @objc private func tapCard(_ sender: UIButton) {
        world.choose(sender.tag)
        haptics.shot(2)
    }

    private func startTilt() {
        guard motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self, let g = data?.gravity else { return }
            self.world.updatePad { pad in
                pad.gravity = SIMD3<Double>(g.x, g.y, g.z)
                pad.hasGravity = true
            }
        }
    }

    private func pushSettings() {
        world.updatePad { pad in
            pad.tilt = self.tiltOn
            pad.shotEvery = self.shotEvery
            pad.cockpit = self.cockpitOn
        }
    }

    private func leave(to next: UIViewController) {
        motion.stopDeviceMotionUpdates()
        audio.stop()
        scnView.delegate = nil
        scnView.scene = nil
        pipView.scene = nil
        view.window?.rootViewController = next
    }

    private func tiltTitle() -> String { tiltOn ? "TILT STEERING  ·  ON" : "TILT STEERING  ·  OFF" }
    private func viewTitle() -> String { cockpitOn ? "VIEW  ·  COCKPIT" : "VIEW  ·  COMMAND CENTER" }
    private func camTitle() -> String { shotEvery ? "SHOT CAM  ·  EVERY SHOT" : "SHOT CAM  ·  KILL SHOTS" }

    private var hudScale: CGFloat {
        let shortSide = min(view.bounds.width, view.bounds.height)
        guard shortSide > 1 else { return UIDevice.current.userInterfaceIdiom == .pad ? 1.4 : 1 }
        if UIDevice.current.userInterfaceIdiom == .pad {
            return min(1.65, max(1.25, shortSide / 520))
        }
        return min(1.15, max(0.9, shortSide / 390))
    }

    private func style(_ label: UILabel, size: CGFloat, weight: UIFont.Weight, align: NSTextAlignment) {
        label.font = UIFont.systemFont(ofSize: size, weight: weight)
        label.textColor = UIColor(white: 0.94, alpha: 1)
        label.textAlignment = align
        label.isUserInteractionEnabled = false
    }

    private func configure(_ button: UIButton, title: String, action: Selector) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        button.setTitleColor(.white, for: .normal)
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor(white: 0.85, alpha: 0.9).cgColor
        button.backgroundColor = UIColor(white: 0, alpha: 0.45)
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func logLine(_ line: String) {
        NSLog("%@", line)
        print(line)
        fflush(stdout)
    }

    private func logOrientation(_ bounds: CGRect) {
        guard bounds.width > 1, bounds.height > 1 else { return }
        let orient = bounds.width > bounds.height ? "landscape" : "portrait"
        let line = "NR2 orientation \(orient) \(Int(bounds.width.rounded()))x\(Int(bounds.height.rounded()))"
        guard line != lastOrientationLog else { return }
        lastOrientationLog = line
        logLine(line)
    }

    private func requestShowcaseOrientation() {
        guard !requestedOrientation else { return }
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            requestedOrientation = true
            return
        }
        let args = ProcessInfo.processInfo.arguments
        let mask: UIInterfaceOrientationMask
        if args.contains("-landscape") {
            mask = .landscapeRight
        } else if args.contains("-portrait") {
            mask = .portrait
        } else {
            requestedOrientation = true
            return
        }
        guard let scene = view.window?.windowScene else { return }
        requestedOrientation = true
        setNeedsUpdateOfSupportedInterfaceOrientations()
        DispatchQueue.main.async { [weak scene] in
            scene?.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
                NSLog("NR2 geometry %@", error.localizedDescription)
                print("NR2 geometry \(error.localizedDescription)")
                fflush(stdout)
            }
        }
    }
}

/// Tilt is relative to the pose when the run starts, so a level phone stays still.
/// A modest tip, about 17 degrees past a small dead zone, is full stick.
private func tiltStick(gravity: SIMD3<Double>, reference: SIMD3<Double>) -> simd_float2 {
    func curve(_ value: Float) -> Float {
        let dead: Float = 0.05
        let full: Float = 0.30
        let sign: Float = value < 0 ? -1 : 1
        let mag = abs(value)
        if mag <= dead { return 0 }
        return sign * min(1, (mag - dead) / (full - dead))
    }
    let dx = Float(gravity.x - reference.x)
    let dz = Float(gravity.z - reference.z)
    return simd_float2(curve(dx), curve(dz))
}

private func angleBetween(_ a: simd_float3, _ b: simd_float3) -> Float {
    let d = max(-1, min(1, simd_dot(swarmNorm(a), swarmNorm(b))))
    return acos(d)
}

private func swarmNorm(_ v: simd_float3) -> simd_float3 {
    let len = simd_length(v)
    if len < 1e-5 { return simd_float3(0, 0, -1) }
    return v / len
}

private func swarmLook(forward: simd_float3, up: simd_float3) -> simd_quatf {
    let f = swarmNorm(forward)
    let z = -f
    var x = simd_cross(up, z)
    if simd_length(x) < 1e-4 {
        x = simd_cross(simd_float3(1, 0, 0), z)
    }
    x = simd_normalize(x)
    let y = simd_normalize(simd_cross(z, x))
    return simd_normalize(simd_quatf(simd_float3x3(columns: (x, y, z))))
}

/// Roll is zero. The camera's right axis stays horizontal, including when looking straight down.
/// Looking toward -Z puts world +X on screen right, matching the old chase controls.
private func levelLook(forward: simd_float3, fallbackRight: simd_float3) -> simd_quatf {
    let f = swarmNorm(forward)
    let z = -f
    var right = simd_cross(simd_float3(0, 1, 0), z)
    if simd_length(right) < 0.2 {
        right = fallbackRight
    } else {
        right.y = 0
    }
    right = swarmNorm(right)
    let up = simd_normalize(simd_cross(z, right))
    return simd_normalize(simd_quatf(simd_float3x3(columns: (right, up, z))))
}

private func logMark(_ text: String) {
    NSLog("%@", text)
    print(text)
    fflush(stdout)
}
