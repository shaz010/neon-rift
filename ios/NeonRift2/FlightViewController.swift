import SceneKit
import UIKit

final class FlightViewController: UIViewController {
    private let scnView = SCNView()
    private let audio = FlightAudio()
    private let haptics = FlightHaptics()
    private let showcase: Bool
    private var profile: RenderProfile
    private var world: FlightWorld!
    private let touch = TouchPad()
    private let overlay = HudOverlay()
    private let flashView = UIView()
    private let grainView = UIView()
    private let topBar = UIView()
    private let bottomBar = UIView()
    private let titleLabel = UILabel()
    private let clockLabel = UILabel()
    private let navLabel = UILabel()
    private let speedLabel = UILabel()
    private let weaponLabel = UILabel()
    private let compassLabel = UILabel()
    private let shieldLabel = UILabel()
    private let promptLabel = UILabel()
    private let resultsLabel = UILabel()
    private let skipButton = UIButton(type: .system)
    private let replayButton = UIButton(type: .custom)
    private var grainIndex = 0
    private var letterboxAmount: CGFloat = 1

    init() {
        let args = ProcessInfo.processInfo.arguments
        let env = ProcessInfo.processInfo.environment
        showcase = args.contains("-showcase") || env["NR2_SHOWCASE"] == "1"
        profile = RenderProfile.detect(showcase: showcase)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        scnView.frame = view.bounds
        scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scnView.backgroundColor = .black
        scnView.antialiasingMode = profile.msaa
        scnView.preferredFramesPerSecond = 60
        scnView.rendersContinuously = true
        scnView.isUserInteractionEnabled = false
        scnView.autoenablesDefaultLighting = false
        view.addSubview(scnView)

        flashView.backgroundColor = .white
        flashView.alpha = 0
        flashView.isUserInteractionEnabled = false
        view.addSubview(flashView)

        grainView.isUserInteractionEnabled = false
        grainView.alpha = 0.16
        grainView.layer.compositingFilter = "softLightBlendMode"
        grainView.backgroundColor = UIColor(patternImage: ArtSet.shared.grains[0])
        grainView.isHidden = !profile.grain
        view.addSubview(grainView)

        for bar in [topBar, bottomBar] {
            bar.backgroundColor = .black
            bar.isUserInteractionEnabled = false
            view.addSubview(bar)
        }

        style(clockLabel, align: .left)
        style(navLabel, align: .left)
        style(speedLabel, align: .right)
        style(weaponLabel, align: .right)
        style(compassLabel, align: .center)
        style(shieldLabel, align: .center)
        promptLabel.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .light)
        promptLabel.textColor = UIColor(white: 0.92, alpha: 1)
        promptLabel.textAlignment = .center
        promptLabel.numberOfLines = 2
        promptLabel.text = "LEFT THUMB FLIES\nHOLD RIGHT TO FIRE"
        promptLabel.isUserInteractionEnabled = false
        view.addSubview(promptLabel)

        titleLabel.attributedText = tracked("NEON RIFT 2", size: 26, kern: 9)
        titleLabel.textAlignment = .center
        titleLabel.isUserInteractionEnabled = false
        view.addSubview(titleLabel)

        resultsLabel.font = UIFont.monospacedSystemFont(ofSize: 15, weight: .light)
        resultsLabel.textColor = UIColor(white: 0.9, alpha: 1)
        resultsLabel.textAlignment = .center
        resultsLabel.numberOfLines = 0
        resultsLabel.isUserInteractionEnabled = false
        resultsLabel.alpha = 0
        view.addSubview(resultsLabel)

        overlay.isUserInteractionEnabled = false
        overlay.backgroundColor = .clear
        overlay.contentMode = .redraw
        view.addSubview(overlay)

        touch.onChange = { [weak self] in
            guard let self else { return }
            self.world?.inputStick = self.touch.stick
            self.world?.inputFire = self.touch.firing
        }
        view.addSubview(touch)

        skipButton.setTitle("SKIP", for: .normal)
        skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 13, weight: .light)
        skipButton.setTitleColor(UIColor(white: 0.88, alpha: 1), for: .normal)
        skipButton.layer.borderWidth = 1
        skipButton.layer.borderColor = UIColor(white: 0.75, alpha: 0.9).cgColor
        skipButton.addTarget(self, action: #selector(skipCinema), for: .touchUpInside)
        view.addSubview(skipButton)

        replayButton.addTarget(self, action: #selector(flyAgain), for: .touchUpInside)
        replayButton.isHidden = true
        view.addSubview(replayButton)

        for label in [clockLabel, navLabel, speedLabel, weaponLabel, compassLabel, shieldLabel] {
            view.addSubview(label)
        }

        NotificationCenter.default.addObserver(self, selector: #selector(pauseScene), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeScene), name: UIApplication.didBecomeActiveNotification, object: nil)

        startWorld()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let b = view.bounds
        scnView.frame = b
        flashView.frame = b
        grainView.frame = b
        overlay.frame = b
        touch.frame = b
        replayButton.frame = b
        let safe = view.safeAreaInsets
        let centers = controlCenters()
        touch.leftCenter = centers.0
        touch.rightCenter = centers.1
        touch.radius = centers.2
        overlay.leftCenter = centers.0
        overlay.rightCenter = centers.1
        overlay.radius = centers.2
        skipButton.frame = CGRect(x: b.width - safe.right - 84, y: safe.top + 8, width: 72, height: 34)
        layoutChrome(letterbox: letterboxAmount)
    }

    private func startWorld() {
        let next = FlightWorld(audio: audio, haptics: haptics, showcase: showcase, profile: profile)
        world = next
        scnView.scene = next.scene
        scnView.pointOfView = next.cameraNode
        scnView.delegate = next
        next.onFrame = { [weak self] world in
            self?.apply(world)
        }
        next.boot()
    }

    private func apply(_ world: FlightWorld) {
        let m = world.hud
        clockLabel.text = m.clock
        navLabel.text = m.nav
        speedLabel.text = m.speed
        weaponLabel.text = "WPN \(m.weapon)%"
        compassLabel.text = "\(cardinal(m.heading))  \(String(format: "%03d", Int(m.heading.rounded()) % 360))"
        shieldLabel.text = "SHLD \(m.shield)    HULL \(m.hull)"
        let combat = m.phase == .combat && !m.showResults
        clockLabel.alpha = combat ? 1 : 0
        navLabel.alpha = combat ? 1 : 0
        speedLabel.alpha = combat ? 1 : 0
        weaponLabel.alpha = combat ? 1 : 0
        compassLabel.alpha = combat ? 1 : 0
        shieldLabel.alpha = combat ? 1 : 0
        promptLabel.alpha = CGFloat(m.promptAlpha)
        titleLabel.alpha = CGFloat(m.titleAlpha)
        flashView.alpha = CGFloat(m.flash) * 0.45
        skipButton.isHidden = m.phase != .cinema
        touch.isUserInteractionEnabled = combat
        replayButton.isHidden = !m.showResults
        resultsLabel.alpha = m.showResults ? 1 : 0
        if m.showResults {
            resultsLabel.text = "NEON RIFT 2\n\n" + m.resultsBody
        }
        topBar.isHidden = m.letterbox < 0.02
        bottomBar.isHidden = m.letterbox < 0.02
        letterboxAmount = CGFloat(m.letterbox)
        layoutChrome(letterbox: letterboxAmount)

        overlay.combat = combat
        overlay.stick = m.stick
        overlay.firing = m.firing
        overlay.lockPoint = project(m.lockWorld)
        overlay.pickupPoints = m.pickups.compactMap { project($0) }
        overlay.sunPoint = project(m.sunWorld)
        overlay.popups = m.popups.compactMap { item in
            guard let p = project(item.0) else { return nil }
            return HudPopup(point: p, text: item.1, age: item.2)
        }
        overlay.setNeedsDisplay()

        if world.wantsGrain {
            grainView.isHidden = false
            let slot = Int(m.phase == .results ? 0 : CACurrentMediaTime() * 10) % 3
            if slot != grainIndex {
                grainIndex = slot
                grainView.backgroundColor = UIColor(patternImage: ArtSet.shared.grains[slot])
            }
        } else {
            grainView.isHidden = true
        }
        if world.profileIsReduced {
            scnView.antialiasingMode = .none
        }
    }

    private func layoutChrome(letterbox: CGFloat) {
        let b = view.bounds
        let safe = view.safeAreaInsets
        let bar = b.height * 0.105 * max(0, min(1, letterbox))
        topBar.frame = CGRect(x: 0, y: 0, width: b.width, height: bar)
        bottomBar.frame = CGRect(x: 0, y: b.height - bar, width: b.width, height: bar)
        titleLabel.frame = CGRect(x: 16, y: b.height - bar, width: b.width - 32, height: max(bar, 36))
        clockLabel.frame = CGRect(x: 18, y: safe.top + 16, width: 140, height: 18)
        navLabel.frame = CGRect(x: 18, y: safe.top + 34, width: 140, height: 18)
        speedLabel.frame = CGRect(x: b.width - 158, y: safe.top + 16, width: 140, height: 18)
        weaponLabel.frame = CGRect(x: b.width - 158, y: safe.top + 34, width: 140, height: 18)
        compassLabel.frame = CGRect(x: b.midX - 70, y: safe.top + 18, width: 140, height: 22)
        let stickY = controlCenters().0.y
        shieldLabel.frame = CGRect(x: 20, y: stickY - 78, width: b.width - 40, height: 18)
        promptLabel.frame = CGRect(x: 24, y: b.midY - 30, width: b.width - 48, height: 48)
        resultsLabel.frame = b.insetBy(dx: 28, dy: b.height * 0.28)
    }

    private func controlCenters() -> (CGPoint, CGPoint, CGFloat) {
        let b = view.bounds
        let safe = view.safeAreaInsets
        let y = b.height - safe.bottom - 112
        return (CGPoint(x: safe.left + 92, y: y), CGPoint(x: b.width - safe.right - 92, y: y), 74)
    }

    private func project(_ worldPoint: simd_float3?) -> CGPoint? {
        guard let worldPoint else { return nil }
        let p = scnView.projectPoint(SCNVector3(worldPoint.x, worldPoint.y, worldPoint.z))
        guard p.z >= 0, p.z < 1 else { return nil }
        return CGPoint(x: CGFloat(p.x), y: CGFloat(p.y))
    }

    private func style(_ label: UILabel, align: NSTextAlignment) {
        label.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .light)
        label.textColor = UIColor(white: 0.82, alpha: 0.92)
        label.textAlignment = align
        label.isUserInteractionEnabled = false
    }

    private func tracked(_ text: String, size: CGFloat, kern: CGFloat) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .ultraLight),
            .foregroundColor: UIColor(red: 0.86, green: 0.88, blue: 0.90, alpha: 1),
            .kern: kern,
        ])
    }

    @objc private func skipCinema() { world?.skipCinema() }

    @objc private func flyAgain() {
        world?.onFrame = nil
        scnView.scene = nil
        scnView.delegate = nil
        startWorld()
    }

    @objc private func pauseScene() {
        scnView.scene?.isPaused = true
    }

    @objc private func resumeScene() {
        AudioSession.engage()
        scnView.scene?.isPaused = false
    }
}

private func cardinal(_ degrees: Float) -> String {
    let names = ["N", "E", "S", "W"]
    var d = degrees.truncatingRemainder(dividingBy: 360)
    if d < 0 { d += 360 }
    let index = Int((d + 45) / 90) % 4
    return names[index]
}

struct HudPopup {
    var point: CGPoint
    var text: String
    var age: Float
}

final class HudOverlay: UIView {
    var combat = false
    var stick = CGPoint.zero
    var firing = false
    var lockPoint: CGPoint?
    var pickupPoints: [CGPoint] = []
    var sunPoint: CGPoint?
    var popups: [HudPopup] = []
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        if let sun = sunPoint, rect.insetBy(dx: -40, dy: -40).contains(sun) {
            ctx.setFillColor(UIColor(red: 1, green: 0.86, blue: 0.55, alpha: 0.22).cgColor)
            ctx.fill(CGRect(x: 0, y: sun.y - 2, width: rect.width, height: 4))
            ctx.setFillColor(UIColor(white: 1, alpha: 0.85).cgColor)
            ctx.fillEllipse(in: CGRect(x: sun.x - 5, y: sun.y - 5, width: 10, height: 10))
        }
        if combat {
            strokeRing(ctx, leftCenter, radius, UIColor(white: 1, alpha: 0.28))
            let knob = CGPoint(x: leftCenter.x + stick.x * radius * 0.72, y: leftCenter.y - stick.y * radius * 0.72)
            ctx.setFillColor(UIColor(white: 0.95, alpha: 0.9).cgColor)
            ctx.fillEllipse(in: CGRect(x: knob.x - 16, y: knob.y - 16, width: 32, height: 32))
            strokeRing(ctx, rightCenter, radius, firing ? UIColor(red: 1, green: 0.55, blue: 0.2, alpha: 0.95) : UIColor(white: 1, alpha: 0.28))
            if firing {
                ctx.setFillColor(UIColor(red: 1, green: 0.45, blue: 0.12, alpha: 0.35).cgColor)
                ctx.fillEllipse(in: CGRect(x: rightCenter.x - 22, y: rightCenter.y - 22, width: 44, height: 44))
            }
            let reticle = CGPoint(x: rect.midX, y: rect.midY - 20)
            ctx.setStrokeColor(UIColor(white: 1, alpha: 0.35).cgColor)
            ctx.setLineWidth(1)
            ctx.stroke(CGRect(x: reticle.x - 7, y: reticle.y - 7, width: 14, height: 14))
        }
        if let lock = lockPoint {
            bracket(ctx, lock, 34, UIColor(red: 1, green: 0.18, blue: 0.08, alpha: 0.95))
        }
        for gem in pickupPoints {
            ctx.setStrokeColor(UIColor(red: 1, green: 0.78, blue: 0.35, alpha: 0.9).cgColor)
            ctx.setLineWidth(1.25)
            ctx.move(to: CGPoint(x: gem.x, y: gem.y - 8))
            ctx.addLine(to: CGPoint(x: gem.x + 6, y: gem.y))
            ctx.addLine(to: CGPoint(x: gem.x, y: gem.y + 8))
            ctx.addLine(to: CGPoint(x: gem.x - 6, y: gem.y))
            ctx.closePath()
            ctx.strokePath()
        }
        for popup in popups {
            let alpha = CGFloat(max(0, 1 - popup.age / 0.95))
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .light),
                .foregroundColor: UIColor(red: 1, green: 0.86, blue: 0.55, alpha: alpha),
            ]
            let origin = CGPoint(x: popup.point.x - 22, y: popup.point.y - 30 - CGFloat(popup.age) * 18)
            (popup.text as NSString).draw(at: origin, withAttributes: attrs)
        }
    }

    private func strokeRing(_ ctx: CGContext, _ center: CGPoint, _ radius: CGFloat, _ color: UIColor) {
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.25)
        ctx.strokeEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }

    private func bracket(_ ctx: CGContext, _ center: CGPoint, _ arm: CGFloat, _ color: UIColor) {
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.5)
        let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (-1, -1, 1, 1), (1, -1, -1, 1), (-1, 1, 1, -1), (1, 1, -1, -1),
        ]
        for (sx, sy, dx, dy) in corners {
            let x = center.x + sx * arm
            let y = center.y + sy * arm
            ctx.move(to: CGPoint(x: x, y: y + dy * 12))
            ctx.addLine(to: CGPoint(x: x, y: y))
            ctx.addLine(to: CGPoint(x: x + dx * 12, y: y))
            ctx.strokePath()
        }
    }
}

final class TouchPad: UIView {
    var stick = CGPoint.zero
    var firing = false
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74
    var onChange: (() -> Void)?
    private var leftTouch: UITouch?
    private var rightTouch: UITouch?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isMultipleTouchEnabled = true
    }

    required init?(coder: NSCoder) { return nil }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { claim(touches) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        if let leftTouch, touches.contains(leftTouch) { updateStick(leftTouch) }
        onChange?()
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }

    private func claim(_ touches: Set<UITouch>) {
        for touch in touches {
            let p = touch.location(in: self)
            if p.x < bounds.midX {
                if leftTouch == nil {
                    leftTouch = touch
                    updateStick(touch)
                }
            } else if rightTouch == nil {
                rightTouch = touch
                firing = true
            }
        }
        onChange?()
    }

    private func release(_ touches: Set<UITouch>) {
        for touch in touches {
            if touch === leftTouch {
                leftTouch = nil
                stick = .zero
            }
            if touch === rightTouch {
                rightTouch = nil
                firing = false
            }
        }
        onChange?()
    }

    private func updateStick(_ touch: UITouch) {
        let p = touch.location(in: self)
        let dx = p.x - leftCenter.x
        let dy = leftCenter.y - p.y
        let mag = hypot(dx, dy)
        let limit = max(radius, 1)
        let scale = mag > limit ? limit / mag : 1
        var x = dx * scale / limit
        var y = dy * scale / limit
        if hypot(x, y) < 0.12 {
            x = 0
            y = 0
        }
        stick = CGPoint(x: x, y: y)
    }
}
