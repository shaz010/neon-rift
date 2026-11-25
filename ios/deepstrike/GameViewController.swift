import UIKit
import WebKit

/// Serves the bundled 17x30 files on a private scheme so module URLs with ?v= still resolve.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let lock = NSLock()
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask as AnyObject)
        guard let url = urlSchemeTask.request.url else {
            finish(urlSchemeTask, id: id, status: 400, data: Data(), mime: "text/plain")
            return
        }
        let rel = relativePath(url)
        guard let file = fileURL(rel) else {
            finish(urlSchemeTask, id: id, status: 404, data: Data(), mime: "text/plain")
            return
        }
        do {
            let data = try Data(contentsOf: file)
            finish(urlSchemeTask, id: id, status: 200, data: data, mime: mimeType(file))
        } catch {
            finish(urlSchemeTask, id: id, status: 404, data: Data(), mime: "text/plain")
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        stopped.insert(ObjectIdentifier(urlSchemeTask as AnyObject))
        lock.unlock()
    }

    private func relativePath(_ url: URL) -> String {
        var path = url.path
        if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        return (path as NSString).standardizingPath
    }

    private func fileURL(_ relative: String) -> URL? {
        guard !relative.isEmpty, !relative.hasPrefix("/"), !relative.contains("..") else { return nil }
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) else { return nil }
        let file = root.appendingPathComponent(relative)
        let rootPath = root.standardizedFileURL.path
        let filePath = file.standardizedFileURL.path
        guard filePath == rootPath || filePath.hasPrefix(rootPath + "/"),
              FileManager.default.fileExists(atPath: filePath) else { return nil }
        return file
    }

    private func mimeType(_ file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "glb": return "model/gltf-binary"
        case "ogg": return "audio/ogg"
        case "m4a": return "audio/mp4"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "txt", "md": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    private func finish(_ task: WKURLSchemeTask, id: ObjectIdentifier, status: Int, data: Data, mime: String) {
        lock.lock()
        let halted = stopped.contains(id)
        lock.unlock()
        if halted { return }
        guard let url = task.request.url else { return }
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store"
            ]
        )
        guard let response else { return }
        task.didReceive(response)
        if !data.isEmpty { task.didReceive(data) }
        task.didFinish()
    }
}

final class GameViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView?

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.020, green: 0.024, blue: 0.020, alpha: 1)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "ds")
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
        if let page = URL(string: "ds://bundle/index.html") {
            web.load(URLRequest(url: page))
        }
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
}
