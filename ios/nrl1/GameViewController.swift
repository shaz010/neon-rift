import UIKit
import WebKit

final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView?

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.020, green: 0.024, blue: 0.047, alpha: 1)
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
        let heavy: Bool
        if let values = message.body as? [Any] {
            heavy = values.count > 1
        } else if let number = message.body as? NSNumber {
            heavy = number.intValue >= 40
        } else {
            heavy = false
        }
        UIImpactFeedbackGenerator(style: heavy ? .heavy : .medium).impactOccurred()
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
