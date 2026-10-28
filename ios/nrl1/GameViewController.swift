import UIKit
import WebKit

final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView?
    private let lightHaptic = UIImpactFeedbackGenerator(style: .light)
    private let mediumHaptic = UIImpactFeedbackGenerator(style: .medium)
    private let heavyHaptic = UIImpactFeedbackGenerator(style: .heavy)
    private let noteHaptic = UINotificationFeedbackGenerator()
    private let selectHaptic = UISelectionFeedbackGenerator()

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.020, green: 0.024, blue: 0.047, alpha: 1)
        lightHaptic.prepare()
        mediumHaptic.prepare()
        heavyHaptic.prepare()
        noteHaptic.prepare()
        selectHaptic.prepare()
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(
            source: Self.hapticScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.add(self, name: "haptic")
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: view.bounds, configuration: config)
        web.navigationDelegate = self
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = true
        web.backgroundColor = view.backgroundColor
        web.scrollView.backgroundColor = view.backgroundColor
        web.scrollView.bounces = false
        web.scrollView.alwaysBounceVertical = false
        web.scrollView.alwaysBounceHorizontal = false
        web.scrollView.isScrollEnabled = false
        web.scrollView.minimumZoomScale = 1
        web.scrollView.maximumZoomScale = 1
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        view.addSubview(web)
        webView = web
        loadGame()
    }

    private func loadGame() {
        guard let webView,
              let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
        else { return }
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.navigationType == .linkActivated {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "haptic" else { return }
        playHaptic(kindOf(message.body))
    }

    private func kindOf(_ body: Any) -> String {
        if let dict = body as? [String: Any], let kind = dict["k"] as? String {
            return kind
        }
        if let values = body as? [Any] {
            let nums = values.compactMap { $0 as? NSNumber }.map(\.intValue)
            let sum = nums.reduce(0, +)
            if nums.count >= 4 || sum >= 140 { return "boom" }
            if sum >= 80 { return "warning" }
            if sum >= 50 { return "heavy" }
            if nums.count >= 2 { return "medium" }
            return "light"
        }
        if let number = body as? NSNumber {
            let n = number.intValue
            if n >= 40 { return "heavy" }
            if n >= 16 { return "medium" }
            return "light"
        }
        return "light"
    }

    private func playHaptic(_ kind: String) {
        switch kind {
        case "light":
            lightHaptic.impactOccurred(intensity: 0.65)
            lightHaptic.prepare()
        case "selection":
            selectHaptic.selectionChanged()
            selectHaptic.prepare()
        case "success":
            noteHaptic.notificationOccurred(.success)
            noteHaptic.prepare()
        case "warning":
            noteHaptic.notificationOccurred(.warning)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) { [weak self] in
                self?.noteHaptic.notificationOccurred(.warning)
                self?.noteHaptic.prepare()
            }
        case "heavy":
            heavyHaptic.impactOccurred(intensity: 1)
            heavyHaptic.prepare()
        case "boom":
            heavyHaptic.impactOccurred(intensity: 1)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
                self?.heavyHaptic.impactOccurred(intensity: 0.9)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
                self?.mediumHaptic.impactOccurred(intensity: 1)
                self?.heavyHaptic.prepare()
            }
        default:
            mediumHaptic.impactOccurred(intensity: 0.85)
            mediumHaptic.prepare()
        }
    }

    private static let hapticScript = """
    (function () {
      if (!window.webkit || !window.webkit.messageHandlers || !window.webkit.messageHandlers.haptic) return;
      navigator.vibrate = function (pattern) {
        try { window.webkit.messageHandlers.haptic.postMessage(pattern == null ? 0 : pattern); } catch (e) {}
        return true;
      };
    })();
    """
}
