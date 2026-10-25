using UnityEngine;
using UnityEngine.UI;

/// On-screen ink: the objective, the three casts, and the graze banner.
/// There is no crosshair. The cast control is labeled with the glyph it will unleash.
public class SliceHud : MonoBehaviour
{
    Text title, objective, sub, shield, banner, bannerSub, castLabel;
    Image bannerWash, flash, pipLance, pipSeal, pipNova, castButton;
    RectTransform castRt;
    bool castPressed;
    struct Pop
    {
        public Vector3 world;
        public string text;
        public Color color;
        public float life;
        public Text label;
    }
    readonly System.Collections.Generic.List<Pop> pops = new System.Collections.Generic.List<Pop>();
    Font font;

    public static readonly Color Teal = Hex(0x5ef2d6);
    public static readonly Color Lavender = Hex(0xc9a0ff);
    public static readonly Color Amber = Hex(0xffd27a);
    public static readonly Color Coral = Hex(0xff9e8a);
    public static readonly Color Ink = Hex(0xe6f4ff);
    public static readonly Color Sky = Hex(0x8ec5ff);

    public static Color Hex(int rgb, float a = 1f)
    {
        return new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, a);
    }

    public void Build()
    {
        font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        if (font == null) font = Resources.GetBuiltinResource<Font>("Arial.ttf");

        var canvasGo = new GameObject("InkHud");
        var canvas = canvasGo.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 20;
        var scaler = canvasGo.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        canvasGo.AddComponent<GraphicRaycaster>();

        flash = FullImage(canvasGo.transform, "Flash", new Color(1, 1, 1, 0));
        bannerWash = FullImage(canvasGo.transform, "Wash", new Color(0.05f, 0.08f, 0.12f, 0));

        title = Label(canvasGo.transform, "Title", 28, TextAnchor.UpperLeft, Ink);
        var titleRt = title.rectTransform;
        titleRt.anchorMin = new Vector2(0f, 1f);
        titleRt.anchorMax = new Vector2(0f, 1f);
        titleRt.pivot = new Vector2(0f, 1f);
        titleRt.anchoredPosition = new Vector2(48, -36);
        titleRt.sizeDelta = new Vector2(700, 80);
        title.text = "NEON RIFT 2";

        shield = Label(canvasGo.transform, "Shield", 24, TextAnchor.UpperRight, Sky);
        var sh = shield.rectTransform;
        sh.anchorMin = new Vector2(1f, 1f);
        sh.anchorMax = new Vector2(1f, 1f);
        sh.pivot = new Vector2(1f, 1f);
        sh.anchoredPosition = new Vector2(-48, -40);
        sh.sizeDelta = new Vector2(420, 60);

        objective = Label(canvasGo.transform, "Objective", 42, TextAnchor.MiddleCenter, Ink);
        var ob = objective.rectTransform;
        ob.anchorMin = new Vector2(0.5f, 0f);
        ob.anchorMax = new Vector2(0.5f, 0f);
        ob.pivot = new Vector2(0.5f, 0f);
        ob.anchoredPosition = new Vector2(0, 168);
        ob.sizeDelta = new Vector2(1500, 70);

        sub = Label(canvasGo.transform, "Sub", 24, TextAnchor.MiddleCenter, Sky);
        var sb = sub.rectTransform;
        sb.anchorMin = new Vector2(0.5f, 0f);
        sb.anchorMax = new Vector2(0.5f, 0f);
        sb.pivot = new Vector2(0.5f, 0f);
        sb.anchoredPosition = new Vector2(0, 124);
        sb.sizeDelta = new Vector2(1400, 44);

        pipLance = Pip(canvasGo.transform, -150, Lavender);
        pipSeal = Pip(canvasGo.transform, 0, Teal);
        pipNova = Pip(canvasGo.transform, 150, Amber);
        var lanceName = Small(canvasGo.transform, "LANCE", -150);
        var sealName = Small(canvasGo.transform, "SEAL", 0);
        var novaName = Small(canvasGo.transform, "NOVA", 150);
        lanceName.color = Lavender;
        sealName.color = Teal;
        novaName.color = Amber;

        var buttonGo = new GameObject("Cast");
        buttonGo.transform.SetParent(canvasGo.transform, false);
        castRt = buttonGo.AddComponent<RectTransform>();
        castRt.anchorMin = new Vector2(1f, 0f);
        castRt.anchorMax = new Vector2(1f, 0f);
        castRt.pivot = new Vector2(1f, 0f);
        castRt.anchoredPosition = new Vector2(-48, 48);
        castRt.sizeDelta = new Vector2(280, 120);
        castButton = buttonGo.AddComponent<Image>();
        castButton.color = new Color(0.08f, 0.12f, 0.16f, 0.72f);
        var btn = buttonGo.AddComponent<Button>();
        btn.targetGraphic = castButton;
        btn.onClick.AddListener(() => castPressed = true);
        castLabel = Label(buttonGo.transform, "CastLabel", 28, TextAnchor.MiddleCenter, Ink);
        castLabel.rectTransform.anchorMin = Vector2.zero;
        castLabel.rectTransform.anchorMax = Vector2.one;
        castLabel.rectTransform.offsetMin = Vector2.zero;
        castLabel.rectTransform.offsetMax = Vector2.zero;

        banner = Label(canvasGo.transform, "Banner", 64, TextAnchor.MiddleCenter, Teal);
        var br = banner.rectTransform;
        br.anchorMin = new Vector2(0.5f, 0.5f);
        br.anchorMax = new Vector2(0.5f, 0.5f);
        br.pivot = new Vector2(0.5f, 0.5f);
        br.anchoredPosition = new Vector2(0, 40);
        br.sizeDelta = new Vector2(1200, 90);
        bannerSub = Label(canvasGo.transform, "BannerSub", 26, TextAnchor.MiddleCenter, Ink);
        var bsr = bannerSub.rectTransform;
        bsr.anchorMin = new Vector2(0.5f, 0.5f);
        bsr.anchorMax = new Vector2(0.5f, 0.5f);
        bsr.pivot = new Vector2(0.5f, 0.5f);
        bsr.anchoredPosition = new Vector2(0, -30);
        bsr.sizeDelta = new Vector2(1200, 50);
    }

    public bool ConsumeCast()
    {
        bool pressed = castPressed;
        castPressed = false;
        return pressed;
    }

    public bool PointerOverCast(Vector2 screen)
    {
        return RectTransformUtility.RectangleContainsScreenPoint(castRt, screen, null);
    }

    public void Refresh(string objectiveText, string subText, int sealedCount, int armedGlyph, bool wet, float shield01, string bannerTitle, string bannerLine, float bannerAlpha, Color flashColor)
    {
        objective.text = objectiveText;
        sub.text = subText;
        shield.text = "INK  " + Mathf.RoundToInt(shield01 * 100f);
        flash.color = flashColor;
        banner.text = bannerTitle;
        bannerSub.text = bannerLine;
        float a = Mathf.Clamp01(bannerAlpha);
        SetAlpha(banner, a);
        SetAlpha(bannerSub, a * 0.9f);
        pipLance.color = ColorFor(Lavender, armedGlyph == 0 && wet, sealedCount > 0);
        pipSeal.color = ColorFor(Teal, armedGlyph == 1 && wet, sealedCount > 1);
        pipNova.color = ColorFor(Amber, armedGlyph == 2 && wet, sealedCount > 2);
        if (sealedCount >= 3)
        {
            castLabel.text = "SEALED";
            castButton.color = new Color(0.08f, 0.16f, 0.14f, 0.55f);
        }
        else if (!wet)
        {
            castLabel.text = "GRAZE";
            castButton.color = new Color(0.08f, 0.1f, 0.14f, 0.55f);
        }
        else if (armedGlyph == 0)
        {
            castLabel.text = "CAST\nLANCE";
            castButton.color = new Color(0.22f, 0.12f, 0.28f, 0.85f);
        }
        else if (armedGlyph == 1)
        {
            castLabel.text = "CAST\nSEAL";
            castButton.color = new Color(0.08f, 0.22f, 0.2f, 0.85f);
        }
        else
        {
            castLabel.text = "CAST\nNOVA";
            castButton.color = new Color(0.28f, 0.18f, 0.08f, 0.85f);
        }
    }

    public void WorldPopup(Vector3 world, string text, Color color)
    {
        var label = Label(transform, "Pop", 28, TextAnchor.MiddleCenter, color);
        // Parent under the canvas, which is this object's child. Find canvas.
        label.transform.SetParent(objective.canvas.transform, false);
        pops.Add(new Pop { world = world, text = text, color = color, life = 1.15f, label = label });
    }

    public void TickPopups(float dt, Camera cam)
    {
        for (int i = pops.Count - 1; i >= 0; i--)
        {
            var p = pops[i];
            p.life -= dt;
            p.world += Vector3.up * dt * 2.2f;
            if (p.life <= 0f || cam == null)
            {
                if (p.label != null) Destroy(p.label.gameObject);
                pops.RemoveAt(i);
                continue;
            }
            Vector3 sp = cam.WorldToScreenPoint(p.world);
            if (sp.z < 0f) p.label.gameObject.SetActive(false);
            else
            {
                p.label.gameObject.SetActive(true);
                RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    (RectTransform)p.label.canvas.transform, sp, null, out var local);
                p.label.rectTransform.anchorMin = new Vector2(0.5f, 0.5f);
                p.label.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
                p.label.rectTransform.anchoredPosition = local;
                p.label.rectTransform.sizeDelta = new Vector2(500, 50);
                p.label.text = p.text;
                SetAlpha(p.label, Mathf.Clamp01(p.life / 0.4f));
            }
            pops[i] = p;
        }
    }

    static Color ColorFor(Color tint, bool armed, bool done)
    {
        if (armed) return tint;
        if (done) return new Color(tint.r, tint.g, tint.b, 0.85f);
        return new Color(tint.r, tint.g, tint.b, 0.28f);
    }

    Image Pip(Transform parent, float x, Color color)
    {
        var go = new GameObject("Pip");
        go.transform.SetParent(parent, false);
        var rt = go.AddComponent<RectTransform>();
        rt.anchorMin = new Vector2(0.5f, 0f);
        rt.anchorMax = new Vector2(0.5f, 0f);
        rt.pivot = new Vector2(0.5f, 0f);
        rt.anchoredPosition = new Vector2(x, 78);
        rt.sizeDelta = new Vector2(36, 14);
        var img = go.AddComponent<Image>();
        img.color = color;
        return img;
    }

    Text Small(Transform parent, string text, float x)
    {
        var label = Label(parent, text, 16, TextAnchor.MiddleCenter, Ink);
        var rt = label.rectTransform;
        rt.anchorMin = new Vector2(0.5f, 0f);
        rt.anchorMax = new Vector2(0.5f, 0f);
        rt.pivot = new Vector2(0.5f, 0f);
        rt.anchoredPosition = new Vector2(x, 52);
        rt.sizeDelta = new Vector2(160, 24);
        label.text = text;
        return label;
    }

    Image FullImage(Transform parent, string name, Color color)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        var rt = go.AddComponent<RectTransform>();
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;
        var img = go.AddComponent<Image>();
        img.color = color;
        img.raycastTarget = false;
        return img;
    }

    Text Label(Transform parent, string name, int size, TextAnchor anchor, Color color)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.AddComponent<RectTransform>();
        var text = go.AddComponent<Text>();
        text.font = font;
        text.fontSize = size;
        text.fontStyle = FontStyle.Bold;
        text.alignment = anchor;
        text.color = color;
        text.horizontalOverflow = HorizontalWrapMode.Overflow;
        text.verticalOverflow = VerticalWrapMode.Overflow;
        text.raycastTarget = false;
        var outline = go.AddComponent<Outline>();
        outline.effectColor = new Color(0.02f, 0.04f, 0.07f, 0.85f);
        outline.effectDistance = new Vector2(1.4f, -1.4f);
        return text;
    }

    static void SetAlpha(Graphic g, float a)
    {
        var c = g.color;
        c.a = a;
        g.color = c;
    }
}
