import Darwin
import SceneKit
import UIKit

enum ShowroomMode {
    case menu
    case inspect
}

/// Hangar pad before a mission. A finger spins the ship, a pinch zooms, and
/// the camera keeps a slow orbit until the finger takes over.
final class ShipShowroomViewController: UIViewController, UIGestureRecognizerDelegate {
    private var mode: ShowroomMode
    private let announce: Bool
    private let art = ArtSet.shared
    private let catalog: ShipCatalog
    private let scnView = SCNView()
    private let scene = SCNScene()
    private let cameraNode = SCNNode()
    private let shipNode: SCNNode
    private let hotspotRoot = SCNNode()
    private var markers: [String: SCNNode] = [:]

    private let titleLabel = UILabel()
    private let hintLabel = UILabel()
    private let flyButton = UIButton(type: .system)
    private let inspectButton = UIButton(type: .system)
    private let backButton = UIButton(type: .system)
    private let orbitButton = UIButton(type: .system)
    private let specCard = UIView()
    private let specTitle = UILabel()
    private let specBadge = UILabel()
    private let specSummary = UILabel()
    private let specStats = UILabel()

    private var displayLink: CADisplayLink?
    private var lastStamp: CFTimeInterval = 0
    private var shipYaw: Float = 0.35
    private var cameraYaw: Float = 0.85
    private var cameraPitch: Float = 0.2
    private var distance: Float
    private var orbiting = true
    private var idle: Float = 0
    private var orbitShown = false
    private var glowPhase: Float = 0
    private var panOrigin = CGPoint.zero
    private var pinchStart: Float = 15
    private var announced = false
    private var selectedID: String?
    private var appliedScale: CGFloat = 0

    init(mode: ShowroomMode, announce: Bool = false) {
        self.mode = mode
        self.announce = announce
        let catalog = ShipCatalog.load()
        self.catalog = catalog
        distance = min(28, max(8, catalog.cameraDistance))
        pinchStart = distance
        shipNode = ShipModelLoader.load(art: ArtSet.shared)
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

    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    private var hudScale: CGFloat {
        let shortSide = min(view.bounds.width, view.bounds.height)
        guard shortSide > 1 else { return isPad ? 1.4 : 1 }
        if isPad { return min(1.65, max(1.25, shortSide / 520)) }
        return min(1.15, max(0.9, shortSide / 390))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildScene()
        scnView.frame = view.bounds
        scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scnView.scene = scene
        scnView.pointOfView = cameraNode
        scnView.backgroundColor = .black
        scnView.antialiasingMode = .multisampling4X
        scnView.preferredFramesPerSecond = 60
        scnView.rendersContinuously = true
        scnView.autoenablesDefaultLighting = false
        view.addSubview(scnView)

        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        scnView.addGestureRecognizer(pan)
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:)))
        pinch.delegate = self
        scnView.addGestureRecognizer(pinch)
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        scnView.addGestureRecognizer(tap)

        titleLabel.textAlignment = .center
        titleLabel.isUserInteractionEnabled = false
        view.addSubview(titleLabel)

        hintLabel.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .light)
        hintLabel.textColor = UIColor(white: 0.82, alpha: 0.95)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 2
        hintLabel.isUserInteractionEnabled = false
        view.addSubview(hintLabel)

        style(flyButton, title: "FLY THE LANE", action: #selector(fly))
        style(inspectButton, title: "INSPECT SHIP", action: #selector(openInspect))
        style(backButton, title: "BACK", action: #selector(closeInspect))
        style(orbitButton, title: "ORBIT", action: #selector(toggleOrbit))

        specCard.backgroundColor = UIColor(white: 0.03, alpha: 0.82)
        specCard.layer.borderWidth = 1
        specCard.layer.borderColor = UIColor(red: 0.45, green: 0.9, blue: 1, alpha: 0.55).cgColor
        specCard.isHidden = true
        view.addSubview(specCard)
        specTitle.font = UIFont.monospacedSystemFont(ofSize: 16, weight: .medium)
        specTitle.textColor = UIColor(white: 0.94, alpha: 1)
        specBadge.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        specBadge.textAlignment = .right
        specSummary.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .light)
        specSummary.textColor = UIColor(white: 0.82, alpha: 1)
        specSummary.numberOfLines = 3
        specStats.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        specStats.textColor = UIColor(red: 0.75, green: 0.95, blue: 1, alpha: 1)
        specStats.numberOfLines = 0
        for label in [specTitle, specBadge, specSummary, specStats] {
            specCard.addSubview(label)
        }

        syncChrome()
        placeCamera()
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFramesPerSecond = 60
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard announce, !announced else { return }
        announced = true
        ShowroomLog.line("NR2 showroom ready")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.selectHotspot("engines")
            ShowroomLog.line("NR2 mark showroom")
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let b = view.bounds
        let safe = view.safeAreaInsets
        let scale = hudScale
        scnView.frame = b
        if abs(scale - appliedScale) > 0.01 {
            appliedScale = scale
            titleLabel.attributedText = tracked("NEON RIFT 2", size: 26 * scale, kern: 8 * scale)
            hintLabel.font = UIFont.monospacedSystemFont(ofSize: 12 * scale, weight: .light)
            let buttonFont = UIFont.systemFont(ofSize: 15 * scale, weight: .medium)
            flyButton.titleLabel?.font = buttonFont
            inspectButton.titleLabel?.font = buttonFont
            let chromeFont = UIFont.systemFont(ofSize: 13 * scale, weight: .medium)
            backButton.titleLabel?.font = chromeFont
            orbitButton.titleLabel?.font = chromeFont
            specTitle.font = UIFont.monospacedSystemFont(ofSize: 16 * scale, weight: .medium)
            specBadge.font = UIFont.monospacedSystemFont(ofSize: 11 * scale, weight: .medium)
            specSummary.font = UIFont.monospacedSystemFont(ofSize: 12 * scale, weight: .light)
            specStats.font = UIFont.monospacedSystemFont(ofSize: 12 * scale, weight: .regular)
        }
        titleLabel.frame = CGRect(x: 16 * scale, y: safe.top + 18 * scale, width: b.width - 32 * scale, height: 36 * scale)
        hintLabel.frame = CGRect(x: 24 * scale, y: titleLabel.frame.maxY + 4 * scale, width: b.width - 48 * scale, height: 40 * scale)
        let buttonW = min(b.width - 48 * scale, 420 * scale)
        let buttonH = 50 * scale
        let flyY = b.height - safe.bottom - 148 * scale
        flyButton.frame = CGRect(x: (b.width - buttonW) / 2, y: flyY, width: buttonW, height: buttonH)
        inspectButton.frame = CGRect(x: flyButton.frame.minX, y: flyButton.frame.maxY + 12 * scale, width: buttonW, height: buttonH)
        let chromeW = 92 * scale
        let chromeH = 34 * scale
        backButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 12 * scale, width: chromeW, height: chromeH)
        orbitButton.frame = CGRect(x: b.width - safe.right - chromeW - 16 * scale, y: safe.top + 12 * scale, width: chromeW, height: chromeH)
        let cardH = 214 * scale
        specCard.frame = CGRect(
            x: 16 * scale,
            y: b.height - safe.bottom - cardH - 16 * scale,
            width: b.width - 32 * scale,
            height: cardH
        )
        let card = specCard.bounds
        specBadge.frame = CGRect(x: card.width - 124 * scale, y: 14 * scale, width: 108 * scale, height: 20 * scale)
        specTitle.frame = CGRect(x: 14 * scale, y: 12 * scale, width: card.width - 146 * scale, height: 24 * scale)
        specSummary.frame = CGRect(x: 14 * scale, y: 42 * scale, width: card.width - 28 * scale, height: 54 * scale)
        specStats.frame = CGRect(x: 14 * scale, y: 102 * scale, width: card.width - 28 * scale, height: 100 * scale)
    }

    deinit {
        displayLink?.invalidate()
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    private func buildScene() {
        scene.background.contents = UIColor(red: 0.012, green: 0.014, blue: 0.018, alpha: 1)
        scene.lightingEnvironment.contents = art.faces
        scene.lightingEnvironment.intensity = 0.55

        let camera = SCNCamera()
        camera.wantsHDR = true
        camera.wantsExposureAdaptation = false
        camera.exposureOffset = 0.35
        camera.bloomIntensity = 0.55
        camera.bloomThreshold = 0.55
        camera.bloomBlurRadius = 8
        camera.saturation = 1.08
        camera.contrast = 1.06
        camera.vignettingIntensity = 0.35
        camera.vignettingPower = 1.1
        camera.zNear = 0.08
        camera.zFar = 180
        camera.fieldOfView = 52
        #if targetEnvironment(simulator)
        camera.wantsDepthOfField = false
        #else
        camera.wantsDepthOfField = true
        camera.focusDistance = 15
        camera.fStop = 5.6
        camera.focalBlurSampleCount = 4
        #endif
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)

        let scale = max(0.05, catalog.scale)
        shipNode.simdScale = simd_float3(repeating: scale)
        shipNode.simdPosition = simd_float3(0, 1.45, 0)
        shipNode.categoryBitMask = 1
        ShipUpgrades.apply(to: shipNode)
        scene.rootNode.addChildNode(shipNode)

        hotspotRoot.name = "hotspots"
        shipNode.addChildNode(hotspotRoot)
        for spot in catalog.hotspots {
            let hit = SCNNode()
            hit.name = "hotspot-\(spot.id)"
            let sphere = SCNSphere(radius: 0.5)
            sphere.segmentCount = 8
            let ghost = SCNMaterial()
            ghost.lightingModel = .constant
            ghost.diffuse.contents = UIColor(red: 0.4, green: 0.95, blue: 1, alpha: 1)
            ghost.transparency = 0.02
            ghost.writesToDepthBuffer = false
            sphere.materials = [ghost]
            hit.geometry = sphere
            hit.simdPosition = spot.point
            let gem = SCNSphere(radius: 0.11)
            gem.segmentCount = 8
            gem.materials = [art.cyanGlow]
            let marker = SCNNode(geometry: gem)
            marker.constraints = [SCNBillboardConstraint()]
            hit.addChildNode(marker)
            hotspotRoot.addChildNode(hit)
            markers[spot.id] = marker
        }

        let floor = SCNFloor()
        floor.reflectivity = 0.4
        floor.reflectionFalloffStart = 0.5
        floor.reflectionFalloffEnd = 14
        floor.reflectionCategoryBitMask = 1
        floor.width = 40
        floor.length = 40
        let floorMat = SCNMaterial()
        floorMat.lightingModel = .physicallyBased
        floorMat.diffuse.contents = UIColor(white: 0.07, alpha: 1)
        floorMat.metalness.contents = 0.65
        floorMat.roughness.contents = 0.35
        floor.materials = [floorMat]
        let floorNode = SCNNode(geometry: floor)
        scene.rootNode.addChildNode(floorNode)

        let pad = SCNCylinder(radius: 6.4, height: 0.05)
        pad.radialSegmentCount = 48
        pad.materials = [art.hullDark]
        let padNode = SCNNode(geometry: pad)
        padNode.simdPosition = simd_float3(0, 0.03, 0)
        scene.rootNode.addChildNode(padNode)
        let ring = SCNTorus(ringRadius: 6.15, pipeRadius: 0.045)
        ring.ringSegmentCount = 64
        ring.pipeSegmentCount = 10
        ring.materials = [art.cyanGlow]
        let ringNode = SCNNode(geometry: ring)
        ringNode.simdPosition = simd_float3(0, 0.08, 0)
        scene.rootNode.addChildNode(ringNode)

        addWall(size: simd_float3(30, 14, 0.4), at: simd_float3(0, 7, -16))
        addWall(size: simd_float3(0.4, 14, 28), at: simd_float3(-15, 7, -2))
        addWall(size: simd_float3(0.4, 14, 28), at: simd_float3(15, 7, -2))
        addWall(size: simd_float3(30, 0.35, 28), at: simd_float3(0, 13.8, -2))
        for z: Float in [-6, 2] {
            let strip = SCNBox(width: 8, height: 0.12, length: 0.35, chamferRadius: 0)
            strip.materials = [art.orangeGlow]
            let node = SCNNode(geometry: strip)
            node.simdPosition = simd_float3(0, 13.5, z)
            scene.rootNode.addChildNode(node)
        }

        addLight(kind: .directional, intensity: 980, color: UIColor(red: 1, green: 0.9, blue: 0.78, alpha: 1), at: simd_float3(5, 9, 7), look: simd_float3(0, 1.4, 0), shadow: true)
        addLight(kind: .directional, intensity: 340, color: UIColor(red: 0.62, green: 0.74, blue: 0.95, alpha: 1), at: simd_float3(-6, 4, 2), look: simd_float3(0, 1.2, 0), shadow: false)
        addLight(kind: .directional, intensity: 460, color: UIColor(red: 0.45, green: 0.85, blue: 1, alpha: 1), at: simd_float3(-2, 3, -8), look: simd_float3(0, 1.4, 1), shadow: false)
        addLight(kind: .omni, intensity: 420, color: UIColor(red: 1, green: 0.78, blue: 0.55, alpha: 1), at: simd_float3(-4, 7.5, 3), look: .zero, shadow: false)
        addLight(kind: .omni, intensity: 360, color: UIColor(red: 0.55, green: 0.85, blue: 1, alpha: 1), at: simd_float3(4, 6.5, -3), look: .zero, shadow: false)
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 90
        ambient.light?.color = UIColor(red: 0.18, green: 0.2, blue: 0.24, alpha: 1)
        scene.rootNode.addChildNode(ambient)
    }

    private func addWall(size: simd_float3, at point: simd_float3) {
        let box = SCNBox(width: CGFloat(size.x), height: CGFloat(size.y), length: CGFloat(size.z), chamferRadius: 0)
        box.materials = [art.hangar]
        let node = SCNNode(geometry: box)
        node.simdPosition = point
        scene.rootNode.addChildNode(node)
    }

    private func addLight(
        kind: SCNLight.LightType,
        intensity: CGFloat,
        color: UIColor,
        at point: simd_float3,
        look: simd_float3,
        shadow: Bool
    ) {
        let node = SCNNode()
        node.light = SCNLight()
        node.light?.type = kind
        node.light?.intensity = intensity
        node.light?.color = color
        node.light?.attenuationStartDistance = 1
        node.light?.attenuationEndDistance = 28
        if shadow {
            node.light?.castsShadow = true
            node.light?.shadowMode = .deferred
            node.light?.shadowMapSize = CGSize(width: 1024, height: 1024)
            node.light?.shadowSampleCount = 8
            node.light?.shadowRadius = 4
            node.light?.shadowColor = UIColor(white: 0, alpha: 0.55)
            node.light?.maximumShadowDistance = 40
        }
        node.simdPosition = point
        if kind == .directional {
            node.look(at: SCNVector3(look.x, look.y, look.z))
        }
        scene.rootNode.addChildNode(node)
    }

    private func placeCamera() {
        shipNode.simdEulerAngles = simd_float3(0, shipYaw, 0)
        let focus = shipNode.simdConvertPosition(catalog.focusPoint, to: nil)
        let flat = distance * cos(cameraPitch)
        let eye = focus + simd_float3(flat * sin(cameraYaw), distance * sin(cameraPitch), flat * cos(cameraYaw))
        cameraNode.simdPosition = eye
        cameraNode.look(at: SCNVector3(focus.x, focus.y, focus.z))
    }

    @objc private func tick(_ link: CADisplayLink) {
        let stamp = link.timestamp
        let dt = lastStamp == 0 ? 0 : Float(min(0.05, stamp - lastStamp))
        lastStamp = stamp
        if orbiting {
            cameraYaw += 0.22 * dt
        } else {
            idle += dt
            if idle > 2.5 { orbiting = true }
        }
        if orbiting != orbitShown {
            orbitShown = orbiting
            orbitButton.backgroundColor = orbiting
                ? UIColor(red: 0.05, green: 0.28, blue: 0.34, alpha: 0.9)
                : UIColor(white: 0, alpha: 0.4)
        }
        glowPhase += dt
        let pulse = 1 + 0.07 * sin(glowPhase * 3)
        shipNode.enumerateChildNodes { node, _ in
            if node.name == "engineGlow" {
                node.simdScale = simd_float3(repeating: pulse)
            }
        }
        if let selectedID, let marker = markers[selectedID] {
            let beat = 1.35 + 0.2 * sin(glowPhase * 4)
            marker.simdScale = simd_float3(repeating: beat)
        }
        placeCamera()
    }

    @objc private func panned(_ gesture: UIPanGestureRecognizer) {
        let point = gesture.translation(in: scnView)
        if gesture.state == .began {
            panOrigin = point
            orbiting = false
            idle = 0
            return
        }
        let dx = Float(point.x - panOrigin.x)
        let dy = Float(point.y - panOrigin.y)
        panOrigin = point
        shipYaw -= dx * 0.012
        cameraPitch = min(0.7, max(-0.2, cameraPitch - dy * 0.0045))
        if gesture.state == .ended || gesture.state == .cancelled {
            idle = 0
        }
    }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        if gesture.state == .began {
            pinchStart = distance
            orbiting = false
            idle = 0
        }
        let next = pinchStart / Float(max(0.2, gesture.scale))
        distance = min(28, max(8, next))
        if gesture.state == .ended || gesture.state == .cancelled {
            idle = 0
        }
    }

    @objc private func tapped(_ gesture: UITapGestureRecognizer) {
        guard mode == .inspect else { return }
        let point = gesture.location(in: scnView)
        let hits = scnView.hitTest(point, options: [
            .searchMode: SCNHitTestSearchMode.all.rawValue,
            .ignoreHiddenNodes: true,
        ])
        for hit in hits {
            var node: SCNNode? = hit.node
            while let current = node {
                if let name = current.name, name.hasPrefix("hotspot-") {
                    selectHotspot(String(name.dropFirst("hotspot-".count)))
                    return
                }
                node = current.parent
            }
        }
    }

    private func selectHotspot(_ id: String) {
        guard let spot = catalog.hotspots.first(where: { $0.id == id }) else { return }
        selectedID = id
        for (key, marker) in markers where key != id {
            marker.simdScale = simd_float3(repeating: 1)
        }
        specTitle.text = spot.title
        specSummary.text = spot.summary
        specStats.text = spot.rows.map { "\($0.0)    \($0.1)" }.joined(separator: "\n")
        if let upgrade = spot.upgrade {
            let fitted = ShipUpgrades.isFitted(upgrade)
            specBadge.text = fitted ? "FITTED" : "LOCKED"
            specBadge.textColor = fitted
                ? UIColor(red: 0.45, green: 1, blue: 0.75, alpha: 1)
                : UIColor(red: 1, green: 0.62, blue: 0.35, alpha: 1)
        } else {
            specBadge.text = "STANDARD"
            specBadge.textColor = UIColor(red: 0.55, green: 0.9, blue: 1, alpha: 1)
        }
        specCard.isHidden = false
    }

    private func syncChrome() {
        let menu = mode == .menu
        flyButton.isHidden = !menu
        inspectButton.isHidden = !menu
        backButton.isHidden = menu
        orbitButton.isHidden = menu
        hotspotRoot.isHidden = menu
        if menu {
            specCard.isHidden = true
            selectedID = nil
        }
        titleLabel.isHidden = !menu
        hintLabel.text = menu
            ? "THE LANE FIGHTER, ON THE PAD"
            : "DRAG TO TURN  ·  PINCH TO ZOOM"
    }

    private func style(_ button: UIButton, title: String, action: Selector) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .medium)
        button.setTitleColor(UIColor(white: 0.94, alpha: 1), for: .normal)
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor(white: 0.78, alpha: 0.9).cgColor
        button.backgroundColor = UIColor(white: 0, alpha: 0.4)
        button.addTarget(self, action: action, for: .touchUpInside)
        view.addSubview(button)
    }

    private func tracked(_ text: String, size: CGFloat, kern: CGFloat) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .ultraLight),
            .foregroundColor: UIColor(red: 0.86, green: 0.88, blue: 0.9, alpha: 1),
            .kern: kern,
        ])
    }

    @objc private func fly() {
        displayLink?.invalidate()
        displayLink = nil
        view.window?.rootViewController = FlightViewController()
    }

    @objc private func openInspect() {
        mode = .inspect
        syncChrome()
    }

    @objc private func closeInspect() {
        mode = .menu
        syncChrome()
    }

    @objc private func toggleOrbit() {
        orbiting.toggle()
        idle = 0
        orbitShown = orbiting
        orbitButton.backgroundColor = orbiting
            ? UIColor(red: 0.05, green: 0.28, blue: 0.34, alpha: 0.9)
            : UIColor(white: 0, alpha: 0.4)
    }
}

private enum ShowroomLog {
    static func line(_ text: String) {
        NSLog("%@", text)
        print(text)
        fflush(stdout)
    }
}
