using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// Ink lane. The fighter floats toward your thumb. Raiders lay coral wakes.
/// Skim the teal halo to wet the ink, then tap to cast Lance, Seal, or Nova.
/// Hitting the coral core breaks your ink. This is the whole toy.
public class SliceDirector : MonoBehaviour
{
    public const float Duration = 42f;
    public const float Fps = 30f;
    public const float Cruise = 50f;
    public static readonly Vector3 PlanetCenter = new Vector3(1600f, -420f, 6400f);
    public const float PlanetRadius = 3900f;
    public static readonly Vector3 SunDir = new Vector3(-0.2208f, 0.5820f, -0.7827f);
    const float CoreRadius = 1.05f;
    const float HaloRadius = 3.6f;
    const float GrazeOffset = 2.15f;
    const float GrazeA = 8f;
    const float GrazeB = 13.5f;
    const float GrazeC = 20.5f;
    const float CastA = 8.8f;
    const float CastB = 14.25f;
    const float CastC = 21.2f;

    static readonly string[] GlyphName = { "LANCE", "SEAL", "NOVA" };
    static readonly string[] GlyphPayoff = { "HIT", "BOUND", "SHATTERED" };

    struct Chunk
    {
        public Transform t;
        public Vector3 v, spin;
        public float life;
    }
    class Ribbon
    {
        public LineRenderer line;
        public readonly List<Vector3> pts = new List<Vector3>();
        public void Push(Vector3 p)
        {
            pts.Add(p);
            if (pts.Count > 48) pts.RemoveAt(0);
        }
        public void Draw(Color head, Color tail)
        {
            int n = pts.Count;
            if (n < 2) { line.positionCount = 0; return; }
            line.positionCount = n;
            for (int i = 0; i < n; i++) line.SetPosition(i, pts[i]);
            line.startColor = tail;
            line.endColor = head;
        }
        public float Distance(Vector3 p, out Vector3 closest)
        {
            closest = pts.Count > 0 ? pts[pts.Count - 1] : p;
            float best = 999f;
            for (int i = 1; i < pts.Count; i++)
            {
                float d = Seg(p, pts[i - 1], pts[i], out var c);
                if (d < best) { best = d; closest = c; }
            }
            return best;
        }
        static float Seg(Vector3 p, Vector3 a, Vector3 b, out Vector3 c)
        {
            Vector3 ab = b - a;
            float den = Vector3.Dot(ab, ab);
            float t = den < 1e-5f ? 0f : Mathf.Clamp01(Vector3.Dot(p - a, ab) / den);
            c = a + ab * t;
            return Vector3.Distance(p, c);
        }
    }
    class Raider
    {
        public int index;
        public Transform body;
        public Ribbon core, halo;
        public bool alive = true;
        public Vector3 pos;
    }
    class Lance
    {
        public Transform body;
        public Vector3 pos, dir;
        public Raider target;
        public float life;
    }
    class SealCast
    {
        public Raider target;
        public LineRenderer ring;
        public float age, power;
    }
    class NovaCast
    {
        public Raider target;
        public Transform bloom;
        public LineRenderer ring;
        public float age;
        public bool burst;
    }

    bool capture;
    string captureDir;
    float sim;
    float shield = 1f;
    float hurtCd;
    int sealedCount;
    int armed = -1;
    float power = 1f;
    Raider armedTarget;
    Vector2 weave;
    Vector3 playerPos;
    Transform player;
    Ribbon playerInk;
    readonly List<Raider> raiders = new List<Raider>();
    readonly List<Lance> lances = new List<Lance>();
    readonly List<SealCast> seals = new List<SealCast>();
    readonly List<NovaCast> novas = new List<NovaCast>();
    readonly List<Chunk> chunks = new List<Chunk>();
    readonly List<GameObject> runObjects = new List<GameObject>();
    Camera cam;
    Transform planet, clouds;
    SliceHud hud;
    Shader litShader, glowShader, planetShader, cloudShader, airShader, skyShader;
    Material glowTemplate;
    float bannerT;
    string bannerTitle = "", bannerLine = "";
    Color bannerColor = SliceHud.Teal;
    float flashA;
    Color flashColor = Color.white;
    float shake;
    bool captureCastA, captureCastB, captureCastC, captureGrazeA, captureGrazeB, captureGrazeC;
    bool running = true;
    StreamWriter captureLog;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static void ArmCaptureClock()
    {
        if (ReadCaptureDir() != null) Time.captureDeltaTime = 1f / Fps;
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (FindAnyObjectByType<SliceDirector>() != null) return;
        foreach (var c in FindObjectsByType<Camera>(FindObjectsSortMode.None)) c.gameObject.SetActive(false);
        foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) l.gameObject.SetActive(false);
        var go = new GameObject("InkLane");
        go.AddComponent<SliceDirector>();
    }

    static string ReadCaptureDir()
    {
        var args = System.Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == "-capture") return args[i + 1];
        return null;
    }

    void Awake()
    {
        captureDir = ReadCaptureDir();
        capture = !string.IsNullOrEmpty(captureDir);
        if (capture) Directory.CreateDirectory(captureDir);
        ResolveShaders();
        BuildSky();
        hud = gameObject.AddComponent<SliceHud>();
        hud.Build();
        if (capture) StartCoroutine(CaptureLoop());
    }

    void ResolveShaders()
    {
        Shader From(string matName, string shaderName)
        {
            var mat = Resources.Load<Material>("Mats/" + matName);
            if (mat != null && mat.shader != null) return mat.shader;
            return Shader.Find(shaderName);
        }
        litShader = From("Lit", "Universal Render Pipeline/Lit");
        if (litShader == null) litShader = Shader.Find("Universal Render Pipeline/Simple Lit");
        glowShader = From("Glow", "NeonRift/Glow");
        planetShader = From("Planet", "NeonRift/Planet");
        cloudShader = From("Clouds", "NeonRift/Clouds");
        airShader = From("Air", "NeonRift/Air");
        skyShader = From("Sky", "NeonRift/Sky");
        if (glowShader != null) glowTemplate = new Material(glowShader);
        Debug.Log($"Shaders lit={litShader != null} glow={glowShader != null} planet={planetShader != null} sky={skyShader != null}");
    }

    void BuildSky()
    {
        cam = new GameObject("Camera").AddComponent<Camera>();
        cam.allowHDR = true;
        cam.allowMSAA = true;
        cam.fieldOfView = 56f;
        cam.nearClipPlane = 0.2f;
        cam.farClipPlane = 30000f;
        cam.clearFlags = CameraClearFlags.Skybox;
        cam.transform.position = new Vector3(0f, 28f, -18f);

        if (skyShader != null)
        {
            var sky = new Material(skyShader);
            var stars = Resources.Load<Texture2D>("Textures/stars");
            if (stars != null) sky.SetTexture("_Stars", stars);
            sky.SetVector("_SunDir", SunDir);
            RenderSettings.skybox = sky;
        }
        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.045f, 0.058f, 0.085f);
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = new Color(1f, 0.96f, 0.9f);
        sun.intensity = 1.35f;
        sun.shadows = LightShadows.None;
        sun.transform.rotation = Quaternion.LookRotation(-SunDir);

        var earthTex = Resources.Load<Texture2D>("Textures/earth");
        var cloudTex = Resources.Load<Texture2D>("Textures/clouds");
        var sphere = UnitSphere(40, 80);
        planet = MeshBody("Planet", sphere, planetShader, PlanetCenter, PlanetRadius);
        if (planet != null && earthTex != null)
        {
            planet.GetComponent<Renderer>().material.SetTexture("_MainTex", earthTex);
            planet.GetComponent<Renderer>().material.SetVector("_SunDir", SunDir);
            planet.rotation = Quaternion.Euler(12f, 28f, 0f);
        }
        clouds = MeshBody("Clouds", sphere, cloudShader, PlanetCenter, PlanetRadius * 1.012f);
        if (clouds != null && cloudTex != null)
        {
            clouds.GetComponent<Renderer>().material.SetTexture("_MainTex", cloudTex);
            clouds.rotation = Quaternion.Euler(12f, 10f, 0f);
        }
        var air = MeshBody("Air", sphere, airShader, PlanetCenter, PlanetRadius * 1.04f);
        if (air != null) air.GetComponent<Renderer>().material.SetVector("_SunDir", SunDir);

        var volumeGo = new GameObject("Grade");
        var volume = volumeGo.AddComponent<Volume>();
        volume.isGlobal = true;
        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        volume.profile = profile;
        var tone = profile.Add<Tonemapping>(true);
        tone.mode.Override(TonemappingMode.ACES);
        var bloom = profile.Add<Bloom>(true);
        bloom.threshold.Override(0.85f);
        bloom.intensity.Override(0.7f);
        bloom.scatter.Override(0.65f);
        var vignette = profile.Add<Vignette>(true);
        vignette.intensity.Override(0.3f);
        vignette.smoothness.Override(0.42f);
        var grade = profile.Add<ColorAdjustments>(true);
        grade.postExposure.Override(0.15f);
        grade.contrast.Override(12f);
        grade.saturation.Override(8f);
        var grain = profile.Add<FilmGrain>(true);
        grain.type.Override(FilmGrainLookup.Thin1);
        grain.intensity.Override(0.07f);

        BeginRun();
    }

    Transform MeshBody(string name, Mesh mesh, Shader shader, Vector3 pos, float radius)
    {
        if (shader == null || mesh == null) return null;
        var go = new GameObject(name);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = new Material(shader);
        go.transform.position = pos;
        go.transform.localScale = Vector3.one * radius;
        return go.transform;
    }

    void BeginRun()
    {
        foreach (var go in runObjects) if (go != null) Destroy(go);
        runObjects.Clear();
        raiders.Clear();
        lances.Clear();
        seals.Clear();
        novas.Clear();
        chunks.Clear();
        sim = 0f;
        shield = 1f;
        hurtCd = 0f;
        sealedCount = 0;
        armed = -1;
        armedTarget = null;
        weave = Vector2.zero;
        running = true;
        bannerT = 0f;
        captureCastA = captureCastB = captureCastC = false;
        captureGrazeA = captureGrazeB = captureGrazeC = false;

        player = BuildShip("craft_racer", 8.2f, new Color(0.78f, 0.86f, 0.93f), new Color(0.16f, 0.2f, 0.28f), SliceHud.Teal).transform;
        playerInk = MakeRibbon(SliceHud.Teal, 0.35f, 1.15f);
        string[] ships = { "craft_speederA", "craft_speederB", "craft_speederC" };
        for (int i = 0; i < 3; i++)
        {
            var body = BuildShip(ships[i], 7.1f, new Color(0.28f, 0.32f, 0.4f), new Color(0.1f, 0.12f, 0.16f), SliceHud.Coral);
            raiders.Add(new Raider
            {
                index = i,
                body = body.transform,
                core = MakeRibbon(SliceHud.Coral, 0.25f, 1.5f),
                halo = MakeRibbon(new Color(SliceHud.Teal.r, SliceHud.Teal.g, SliceHud.Teal.b, 0.45f), 1.4f, 7f),
            });
        }
    }

    Ribbon MakeRibbon(Color color, float widthA, float widthB)
    {
        var go = new GameObject("Wake");
        runObjects.Add(go);
        var line = go.AddComponent<LineRenderer>();
        line.useWorldSpace = true;
        line.numCornerVertices = 3;
        line.numCapVertices = 2;
        line.widthCurve = AnimationCurve.Linear(0f, widthA, 1f, widthB);
        line.material = glowTemplate != null ? new Material(glowTemplate) : new Material(Shader.Find("Sprites/Default"));
        line.textureMode = LineTextureMode.Stretch;
        line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        line.receiveShadows = false;
        line.startColor = color;
        line.endColor = color;
        return new Ribbon { line = line };
    }

    GameObject BuildShip(string resource, float length, Color hull, Color dark, Color engine)
    {
        var pivot = new GameObject(resource);
        runObjects.Add(pivot);
        var prefab = Resources.Load<GameObject>("Ships/" + resource);
        if (prefab == null)
        {
            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            Destroy(capsule.GetComponent<Collider>());
            capsule.transform.SetParent(pivot.transform, false);
            capsule.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            capsule.transform.localScale = new Vector3(1.2f, length * 0.45f, 1.2f);
            Paint(capsule.GetComponent<Renderer>(), hull);
        }
        else
        {
            var model = Instantiate(prefab, pivot.transform, false);
            foreach (var col in model.GetComponentsInChildren<Collider>()) Destroy(col);
            var filters = model.GetComponentsInChildren<MeshFilter>();
            Bounds mb = new Bounds(Vector3.zero, Vector3.one);
            bool any = false;
            foreach (var mf in filters)
            {
                if (mf.sharedMesh == null) continue;
                if (!any) { mb = mf.sharedMesh.bounds; any = true; }
                else mb.Encapsulate(mf.sharedMesh.bounds);
            }
            float scale = any ? length / Mathf.Max(0.01f, mb.size.z) : 1f;
            model.transform.localScale = Vector3.one * scale;
            if (any) model.transform.localPosition = -mb.center * scale;
            foreach (var r in model.GetComponentsInChildren<Renderer>()) PaintShip(r, hull, dark, engine);
        }
        var glow = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Destroy(glow.GetComponent<Collider>());
        glow.transform.SetParent(pivot.transform, false);
        glow.transform.localPosition = new Vector3(0f, 0f, -length * 0.42f);
        glow.transform.localScale = Vector3.one * (length * 0.11f);
        var gr = glow.GetComponent<Renderer>();
        gr.sharedMaterial = InkMat(engine);
        return pivot;
    }

    void PaintShip(Renderer r, Color hull, Color dark, Color engine)
    {
        var src = r.sharedMaterials;
        var dst = new Material[src.Length];
        for (int i = 0; i < src.Length; i++)
        {
            string n = src[i] != null ? src[i].name.ToLowerInvariant() : "";
            if (litShader == null) { dst[i] = InkMat(n.Contains("red") ? engine : hull); continue; }
            var m = new Material(litShader);
            if (n.Contains("red"))
            {
                m.SetColor("_BaseColor", engine);
                m.SetColor("_EmissionColor", engine * 4f);
                m.EnableKeyword("_EMISSION");
            }
            else if (n.Contains("dark"))
            {
                m.SetColor("_BaseColor", dark);
                m.SetFloat("_Metallic", 0.5f);
                m.SetFloat("_Smoothness", 0.42f);
            }
            else
            {
                m.SetColor("_BaseColor", hull);
                m.SetFloat("_Metallic", 0.7f);
                m.SetFloat("_Smoothness", 0.58f);
            }
            dst[i] = m;
        }
        r.materials = dst;
    }

    void Paint(Renderer r, Color color)
    {
        r.sharedMaterial = litShader != null ? new Material(litShader) : InkMat(color);
        if (litShader != null)
        {
            r.material.SetColor("_BaseColor", color);
            r.material.SetFloat("_Metallic", 0.4f);
            r.material.SetFloat("_Smoothness", 0.45f);
        }
    }

    Material InkMat(Color color)
    {
        var m = glowTemplate != null ? new Material(glowTemplate) : new Material(Shader.Find("Sprites/Default"));
        if (m.HasProperty("_Color")) m.SetColor("_Color", color);
        else m.color = color;
        return m;
    }

    void Update()
    {
        if (capture) return;
        if (!running) return;
        Tick(Mathf.Clamp(Time.deltaTime, 0.0001f, 0.05f));
    }

    void Tick(float dt)
    {
        float prev = sim;
        sim += dt;
        StepPlayer(dt);
        StepRaiders(dt);
        StepWakes();
        StepCasts(dt);
        StepChunks(dt);
        StepCamera(dt);
        StepScript(prev, sim);
        bannerT = Mathf.Max(0f, bannerT - dt);
        flashA = Mathf.Max(0f, flashA - dt * 1.8f);
        shake = Mathf.Max(0f, shake - dt * 2.4f);
        if (planet != null) planet.Rotate(Vector3.up, 0.35f * dt, Space.World);
        if (clouds != null) clouds.Rotate(Vector3.up, -0.22f * dt, Space.World);
        PresentHud(dt);
        if (!capture && sealedCount >= 3 && Input.GetKeyDown(KeyCode.R)) BeginRun();
    }

    void StepScript(float prev, float now)
    {
        if (!capture) return;
        if (!captureGrazeA && prev < GrazeA && now >= GrazeA) { captureGrazeA = true; ForceGraze(0); }
        if (!captureGrazeB && prev < GrazeB && now >= GrazeB) { captureGrazeB = true; ForceGraze(1); }
        if (!captureGrazeC && prev < GrazeC && now >= GrazeC) { captureGrazeC = true; ForceGraze(2); }
        if (!captureCastA && prev < CastA && now >= CastA) { captureCastA = true; TryCast(); }
        if (!captureCastB && prev < CastB && now >= CastB) { captureCastB = true; TryCast(); }
        if (!captureCastC && prev < CastC && now >= CastC) { captureCastC = true; TryCast(); }
    }

    void StepPlayer(float dt)
    {
        Vector2 target = capture ? ScriptedWeave(sim) : ReadWeave();
        weave = Vector2.Lerp(weave, target, 1f - Mathf.Exp(-7.5f * dt));
        playerPos = Lane(sim) + new Vector3(weave.x, weave.y, 0f);
        var face = Quaternion.LookRotation(Vector3.forward + new Vector3(weave.x, weave.y, 0f) * 0.03f, Vector3.up);
        player.SetPositionAndRotation(playerPos, face);
        playerInk.Push(playerPos - Vector3.forward * 3.2f + Vector3.up * -0.4f);
        bool cast = false;
        if (!capture)
        {
            if (hud.ConsumeCast() || Input.GetKeyDown(KeyCode.Space)) cast = true;
            if (Input.GetMouseButtonDown(0) && !hud.PointerOverCast(Input.mousePosition)) cast = true;
            if (Tapped()) cast = true;
        }
        if (cast) TryCast();
        if (hurtCd > 0f) hurtCd -= dt;
    }

    Vector2 ReadWeave()
    {
        if (Input.touchCount > 0)
        {
            var t = Input.GetTouch(0);
            float nx = (t.position.x / Screen.width - 0.5f) * 2f;
            float ny = (t.position.y / Screen.height - 0.5f) * 2f;
            return new Vector2(Mathf.Clamp(nx, -1f, 1f) * 18f, Mathf.Clamp(ny, -1f, 1f) * 10f);
        }
        float mx = (Input.mousePosition.x / Mathf.Max(1f, Screen.width) - 0.5f) * 2f;
        float my = (Input.mousePosition.y / Mathf.Max(1f, Screen.height) - 0.5f) * 2f;
        return new Vector2(Mathf.Clamp(mx, -1f, 1f) * 18f, Mathf.Clamp(my, -1f, 1f) * 10f);
    }

    bool tapDown;
    float tapTime;
    Vector2 tapStart;
    bool Tapped()
    {
        if (Input.touchCount == 0) { tapDown = false; return false; }
        var t = Input.GetTouch(0);
        if (t.phase == TouchPhase.Began) { tapDown = true; tapTime = 0f; tapStart = t.position; }
        if (!tapDown) return false;
        tapTime += Time.deltaTime;
        if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
        {
            tapDown = false;
            return tapTime < 0.22f && (t.position - tapStart).sqrMagnitude < 28f * 28f && !hud.PointerOverCast(t.position);
        }
        return false;
    }

    void StepRaiders(float dt)
    {
        for (int i = 0; i < raiders.Count; i++)
        {
            var r = raiders[i];
            if (!r.alive) continue;
            r.pos = RaiderPos(i, sim);
            r.body.SetPositionAndRotation(r.pos, Quaternion.LookRotation(Vector3.forward, Vector3.up));
            r.core.Push(r.pos);
            r.halo.Push(r.pos);
        }
    }

    void StepWakes()
    {
        var teal = SliceHud.Teal;
        playerInk.Draw(new Color(teal.r, teal.g, teal.b, 0.95f), new Color(teal.r, teal.g, teal.b, 0f));
        foreach (var r in raiders)
        {
            if (!r.alive)
            {
                var fade = SliceHud.Coral;
                r.core.Draw(new Color(fade.r, fade.g, fade.b, 0.2f), new Color(fade.r, fade.g, fade.b, 0f));
                r.halo.Draw(new Color(teal.r, teal.g, teal.b, 0.08f), new Color(teal.r, teal.g, teal.b, 0f));
                continue;
            }
            r.core.Draw(SliceHud.Coral, new Color(SliceHud.Coral.r, SliceHud.Coral.g, SliceHud.Coral.b, 0f));
            r.halo.Draw(new Color(teal.r, teal.g, teal.b, 0.55f), new Color(teal.r, teal.g, teal.b, 0f));
            if (capture || armed >= 0) continue;
            float d = r.halo.Distance(playerPos, out _);
            if (d < CoreRadius)
            {
                if (hurtCd <= 0f && !capture)
                {
                    shield = Mathf.Max(0f, shield - 0.28f);
                    hurtCd = 0.55f;
                    Say("WAKE", "THE CORE TOOK INK", SliceHud.Coral, 0.8f);
                    Kick(0.35f);
                    Flash(SliceHud.Coral, 0.35f);
                    if (shield <= 0f) Lose();
                }
            }
            else if (d < HaloRadius)
            {
                Wet(r, d);
            }
        }
    }

    void Wet(Raider r, float dist)
    {
        if (!r.alive || armed >= 0) return;
        float tight = Mathf.InverseLerp(HaloRadius, CoreRadius + 0.15f, dist);
        power = Mathf.Lerp(1f, 3f, Mathf.Clamp01(tight));
        armed = capture ? r.index : (sealedCount % 3);
        armedTarget = r;
        Say("GRAZE", "INK IS WET", SliceHud.Teal, 0.9f);
        Flash(SliceHud.Teal, 0.22f);
        Kick(0.12f);
        hud.WorldPopup(playerPos + Vector3.up * 2f, "GRAZE", SliceHud.Teal);
        Ring(playerPos, Vector3.forward, 2.4f, SliceHud.Teal, 0.45f);
        Debug.Log($"GRAZE raider={r.index} dist={dist:0.00} power={power:0.00} sim={sim:0.00}");
    }

    void ForceGraze(int index)
    {
        if (index < 0 || index >= raiders.Count) return;
        var r = raiders[index];
        float d = r.halo.pts.Count > 1 ? r.halo.Distance(playerPos, out _) : 99f;
        captureLog?.WriteLine($"force-graze i={index} dist={d:0.00} sim={sim:0.00} player={playerPos} raider={r.pos}");
        Debug.Log($"force-graze i={index} dist={d:0.00}");
        if (d > HaloRadius + 2.5f)
        {
            // The skim missed the ribbon. Still wet the ink so the cast reads,
            // and log it so the framing can be corrected.
            captureLog?.WriteLine("WARN skim was wide");
        }
        Wet(r, Mathf.Min(d, HaloRadius - 0.2f));
    }

    void TryCast()
    {
        if (sealedCount >= 3) { if (!capture) BeginRun(); return; }
        if (armed < 0 || armedTarget == null || !armedTarget.alive)
        {
            Say("GRAZE", "NEAR-MISS WHILE THE INK IS WET", SliceHud.Sky, 0.85f);
            return;
        }
        int glyph = armed;
        var target = armedTarget;
        float p = power;
        armed = -1;
        armedTarget = null;
        if (glyph == 0) FireLance(target, p);
        else if (glyph == 1) FireSeal(target, p);
        else FireNova(target, p);
        Debug.Log($"CAST {GlyphName[glyph]} at {target.index} sim={sim:0.00}");
    }

    void FireLance(Raider target, float p)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        Destroy(go.GetComponent<Collider>());
        runObjects.Add(go);
        go.transform.localScale = new Vector3(0.18f, 0.18f, 4.5f + p);
        go.GetComponent<Renderer>().sharedMaterial = InkMat(SliceHud.Lavender);
        Vector3 dir = (target.pos - playerPos).normalized;
        var lance = new Lance
        {
            body = go.transform,
            pos = playerPos + dir * 3f,
            dir = dir,
            target = target,
            life = 1.4f,
        };
        lances.Add(lance);
        Say("LANCE", "POWER " + p.ToString("0"), SliceHud.Lavender, 0.7f);
        Flash(SliceHud.Lavender, 0.3f);
    }

    void FireSeal(Raider target, float p)
    {
        var ring = MakeRibbon(SliceHud.Teal, 0.22f, 0.22f);
        seals.Add(new SealCast { target = target, ring = ring.line, age = 0f, power = p });
        // The seal ring is not a trail. Stop the helper ribbon from being a wake.
        Say("SEAL", "POWER " + p.ToString("0"), SliceHud.Teal, 0.7f);
        Flash(SliceHud.Teal, 0.34f);
    }

    void FireNova(Raider target, float p)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Destroy(go.GetComponent<Collider>());
        runObjects.Add(go);
        go.GetComponent<Renderer>().sharedMaterial = InkMat(SliceHud.Amber);
        var ring = MakeRibbon(SliceHud.Amber, 0.28f, 0.28f);
        novas.Add(new NovaCast { target = target, bloom = go.transform, ring = ring.line, age = 0f });
        Say("NOVA", "POWER " + p.ToString("0"), SliceHud.Amber, 0.9f);
        Flash(SliceHud.Amber, 0.55f);
        Kick(0.7f);
    }

    void StepCasts(float dt)
    {
        for (int i = lances.Count - 1; i >= 0; i--)
        {
            var l = lances[i];
            l.life -= dt;
            l.pos += l.dir * (210f * dt);
            if (l.body != null)
            {
                l.body.position = l.pos;
                l.body.rotation = Quaternion.LookRotation(l.dir);
            }
            bool hit = l.target != null && l.target.alive && Vector3.Distance(l.pos, l.target.pos) < 4.2f;
            if (hit || l.life <= 0f)
            {
                if (hit) Payoff(l.target, 0, SliceHud.Lavender, 10);
                if (l.body != null) Destroy(l.body.gameObject);
                lances.RemoveAt(i);
            }
        }
        for (int i = seals.Count - 1; i >= 0; i--)
        {
            var s = seals[i];
            s.age += dt;
            float u = Mathf.Clamp01(s.age / 0.48f);
            float radius = Mathf.Lerp(8.5f, 0.7f, u * u);
            if (s.target != null) Circle(s.ring, s.target.pos, radius, SliceHud.Teal);
            if (u >= 1f)
            {
                if (s.target != null) Payoff(s.target, 1, SliceHud.Teal, 12);
                if (s.ring != null) Destroy(s.ring.gameObject);
                seals.RemoveAt(i);
            }
        }
        for (int i = novas.Count - 1; i >= 0; i--)
        {
            var n = novas[i];
            n.age += dt;
            float u = Mathf.Clamp01(n.age / 0.7f);
            if (n.bloom != null && n.target != null)
            {
                n.bloom.position = n.target.pos;
                float s = Mathf.Lerp(0.4f, 15f + 4f, u);
                n.bloom.localScale = Vector3.one * s;
                var c = SliceHud.Amber;
                c.a = 1f - u;
                n.bloom.GetComponent<Renderer>().material.SetColor("_Color", c);
            }
            if (n.target != null) Circle(n.ring, n.target.pos, Mathf.Lerp(1f, 18f, u), SliceHud.Amber);
            if (!n.burst && n.age > 0.12f)
            {
                n.burst = true;
                if (n.target != null) Payoff(n.target, 2, SliceHud.Amber, 16);
            }
            if (n.age > 0.85f)
            {
                if (n.bloom != null) Destroy(n.bloom.gameObject);
                if (n.ring != null) Destroy(n.ring.gameObject);
                novas.RemoveAt(i);
            }
        }
    }

    void Payoff(Raider r, int glyph, Color ink, int bits)
    {
        if (r == null || !r.alive) return;
        r.alive = false;
        sealedCount++;
        Vector3 inherit = Vector3.forward * Cruise;
        Burst(r.pos, inherit, ink, bits);
        if (r.body != null) r.body.gameObject.SetActive(false);
        Say(GlyphName[glyph], GlyphPayoff[glyph], ink, 1.1f);
        hud.WorldPopup(r.pos, GlyphName[glyph], ink);
        Kick(glyph == 2 ? 0.85f : 0.4f);
        Flash(ink, glyph == 2 ? 0.6f : 0.35f);
        Debug.Log($"PAYOFF {GlyphName[glyph]} sealed={sealedCount} sim={sim:0.00}");
    }

    void Circle(LineRenderer line, Vector3 center, float radius, Color color)
    {
        if (line == null) return;
        const int seg = 28;
        line.positionCount = seg + 1;
        line.startColor = color;
        line.endColor = color;
        for (int i = 0; i <= seg; i++)
        {
            float a = i / (float)seg * Mathf.PI * 2f;
            line.SetPosition(i, center + new Vector3(Mathf.Cos(a), Mathf.Sin(a) * 0.72f, Mathf.Sin(a) * 0.25f) * radius);
        }
    }

    void Ring(Vector3 center, Vector3 axis, float radius, Color color, float life)
    {
        // A short-lived graze ring, recycled through the chunk list as a scaled empty.
        var go = new GameObject("GrazeRing");
        runObjects.Add(go);
        var line = go.AddComponent<LineRenderer>();
        line.material = glowTemplate != null ? new Material(glowTemplate) : new Material(Shader.Find("Sprites/Default"));
        line.useWorldSpace = true;
        line.widthMultiplier = 0.12f;
        line.loop = true;
        Circle(line, center, radius, color);
        StartCoroutine(FadeRing(line, life));
    }

    System.Collections.IEnumerator FadeRing(LineRenderer line, float life)
    {
        float t = life;
        while (t > 0f && line != null)
        {
            t -= capture ? (1f / Fps) : Time.deltaTime;
            var c = line.startColor;
            c.a = Mathf.Clamp01(t / life);
            line.startColor = c;
            line.endColor = c;
            yield return null;
        }
        if (line != null) Destroy(line.gameObject);
    }

    void Burst(Vector3 at, Vector3 inherit, Color ink, int count)
    {
        for (int i = 0; i < count; i++)
        {
            bool hot = i % 2 == 0;
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(cube.GetComponent<Collider>());
            runObjects.Add(cube);
            float s = Random.Range(0.22f, 0.62f);
            cube.transform.position = at + Random.insideUnitSphere * 0.7f;
            cube.transform.localScale = new Vector3(s, s * 0.55f, s * 1.35f);
            cube.transform.rotation = Random.rotation;
            cube.GetComponent<Renderer>().sharedMaterial = hot ? InkMat(ink) : HullChunk();
            chunks.Add(new Chunk
            {
                t = cube.transform,
                v = inherit * 0.25f + Random.onUnitSphere * Random.Range(7f, 18f),
                spin = Random.insideUnitSphere * 6f,
                life = Random.Range(2.4f, 3.8f),
            });
        }
    }

    Material HullChunk()
    {
        if (litShader == null) return InkMat(new Color(0.2f, 0.22f, 0.26f));
        var m = new Material(litShader);
        m.SetColor("_BaseColor", new Color(0.2f, 0.23f, 0.28f));
        m.SetFloat("_Metallic", 0.65f);
        m.SetFloat("_Smoothness", 0.4f);
        return m;
    }

    void StepChunks(float dt)
    {
        for (int i = chunks.Count - 1; i >= 0; i--)
        {
            var c = chunks[i];
            if (c.t == null) { chunks.RemoveAt(i); continue; }
            c.v *= Mathf.Exp(-0.35f * dt);
            c.t.position += c.v * dt;
            c.t.Rotate(c.spin * (40f * dt), Space.World);
            c.life -= dt;
            if (c.life < 0.5f) c.t.localScale *= Mathf.Clamp01(c.life / 0.5f);
            if (c.life <= 0f) { Destroy(c.t.gameObject); chunks.RemoveAt(i); continue; }
            chunks[i] = c;
        }
    }

    void StepCamera(float dt)
    {
        Vector3 look = playerPos + Vector3.forward * 48f + Vector3.right * 16f + Vector3.down * 2.5f;
        Vector3 desired = playerPos - Vector3.forward * 15.5f + Vector3.up * 5.4f - Vector3.right * 3.2f;
        if (shake > 0f) desired += Random.insideUnitSphere * shake * 0.45f;
        cam.transform.position = Vector3.Lerp(cam.transform.position, desired, 1f - Mathf.Exp(-4.5f * dt));
        var rot = Quaternion.LookRotation(look - cam.transform.position, Vector3.up);
        rot *= Quaternion.Euler(0f, 0f, -weave.x * 0.7f);
        cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, rot, 1f - Mathf.Exp(-6f * dt));
    }

    void PresentHud(float dt)
    {
        string main;
        string sub;
        if (!running)
        {
            main = "WAKE TOOK THE SHIP";
            sub = "TAP TO FLY THE LANE AGAIN";
        }
        else if (sealedCount >= 3)
        {
            main = "LANE SEALED";
            sub = "THE INK HOLDS";
        }
        else if (armed < 0)
        {
            main = "GRAZE THE WAKE";
            sub = "SKIM THE TEAL HALO   ·   SEAL THE RAIDERS  " + sealedCount + "/3";
        }
        else
        {
            main = "TAP TO CAST " + GlyphName[armed];
            sub = "SEAL THE RAIDERS  " + sealedCount + "/3";
        }
        var fc = flashColor;
        fc.a = flashA;
        hud.Refresh(main, sub, sealedCount, armed, armed >= 0, shield, bannerT > 0f ? bannerTitle : "", bannerT > 0f ? bannerLine : "", bannerT, fc);
        hud.TickPopups(dt, cam);
    }

    void Say(string title, string line, Color color, float time)
    {
        bannerTitle = title;
        bannerLine = line;
        bannerColor = color;
        bannerT = time;
    }

    void Flash(Color color, float a)
    {
        flashColor = color;
        flashA = Mathf.Max(flashA, a);
    }

    void Kick(float amount) { shake = Mathf.Max(shake, amount); }

    void Lose()
    {
        running = false;
        Say("WAKE", "THE CORE TOOK THE SHIP", SliceHud.Coral, 2f);
        Invoke(nameof(BeginRun), 1.6f);
    }

    static Vector3 Lane(float t)
    {
        return new Vector3(Mathf.Sin(t * 0.18f) * 8f, 22f + Mathf.Sin(t * 0.13f) * 3.5f, t * Cruise);
    }

    static Vector3 Hold(int i, float t)
    {
        float bob = Mathf.Sin(t * 1.15f + i * 1.7f) * 1.05f;
        if (i == 0) return new Vector3(14f, 2f + bob, 22f);
        if (i == 1) return new Vector3(-12f, 3.4f + bob, 24f);
        return new Vector3(3f, 6f + bob, 18f);
    }

    static float Arrive(int i, float t)
    {
        float a = i == 0 ? 2.2f : i == 1 ? 3.8f : 5.0f;
        float b = i == 0 ? 6.0f : i == 1 ? 10.2f : 16.2f;
        return Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(a, b, t));
    }

    static Vector3 RaiderPos(int i, float t)
    {
        Vector3 hold = Hold(i, t);
        if (!Application.isPlaying) return Lane(t) + hold;
        Vector3 far = new Vector3(hold.x * 1.8f, hold.y + 12f, hold.z + 46f);
        return Lane(t) + Vector3.Lerp(far, hold, Arrive(i, t));
    }

    static Vector2 ScriptedWeave(float now)
    {
        Vector2 idle = new Vector2(Mathf.Sin(now * 0.62f) * 3.1f, Mathf.Sin(now * 0.44f) * 1.3f);
        idle = Skim(idle, now, GrazeA, 0);
        idle = Skim(idle, now, GrazeB, 1);
        idle = Skim(idle, now, GrazeC, 2);
        return idle;
    }

    static Vector2 Skim(Vector2 idle, float now, float when, int i)
    {
        float begin = when - 1.65f;
        float end = when + 1.35f;
        if (now < begin || now > end) return idle;
        Vector3 hold = Hold(i, when);
        var target = new Vector2(hold.x, hold.y + GrazeOffset);
        if (now < when + 0.1f)
        {
            float k = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(begin, when - 0.04f, now));
            return Vector2.Lerp(idle, target, k);
        }
        float outK = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(when + 0.1f, end, now));
        return Vector2.Lerp(target, idle, outK);
    }

    IEnumerator CaptureLoop()
    {
        Screen.SetResolution(1280, 720, false);
        yield return new WaitForEndOfFrame();
        yield return new WaitForEndOfFrame();
        captureLog = new StreamWriter(Path.Combine(captureDir, "log.txt"), false);
        int total = Mathf.RoundToInt(Duration * Fps);
        int establish = Mathf.RoundToInt(6f * Fps);
        int lance = Mathf.RoundToInt(9.05f * Fps);
        int nova = Mathf.RoundToInt(22.15f * Fps);
        for (int step = 0; step < total; step++)
        {
            Tick(1f / Fps);
            yield return new WaitForEndOfFrame();
            var tex = new Texture2D(Screen.width, Screen.height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, Screen.width, Screen.height), 0, 0);
            tex.Apply();
            File.WriteAllBytes(Path.Combine(captureDir, $"frame_{step:D4}.jpg"), tex.EncodeToJPG(90));
            if (step == establish) File.WriteAllBytes(Path.Combine(captureDir, "shot_establish.png"), tex.EncodeToPNG());
            if (step == lance) File.WriteAllBytes(Path.Combine(captureDir, "shot_lance.png"), tex.EncodeToPNG());
            if (step == nova) File.WriteAllBytes(Path.Combine(captureDir, "shot_nova.png"), tex.EncodeToPNG());
            Destroy(tex);
            if (step % 30 == 0) captureLog.WriteLine($"t={sim:0.00} sealed={sealedCount} armed={armed} shield={shield:0.00}");
            captureLog.Flush();
        }
        captureLog.WriteLine("done");
        captureLog.Close();
        File.WriteAllText(Path.Combine(captureDir, "done.txt"), "ok");
        Application.Quit(0);
    }

    static Mesh UnitSphere(int lat, int lon)
    {
        var mesh = new Mesh { name = "UnitSphere" };
        var v = new List<Vector3>((lat + 1) * (lon + 1));
        var n = new List<Vector3>(v.Capacity);
        var uv = new List<Vector2>(v.Capacity);
        var tris = new List<int>(lat * lon * 6);
        for (int y = 0; y <= lat; y++)
        {
            float vt = y / (float)lat;
            float phi = vt * Mathf.PI;
            for (int x = 0; x <= lon; x++)
            {
                float ut = x / (float)lon;
                float theta = ut * Mathf.PI * 2f;
                var p = new Vector3(Mathf.Sin(phi) * Mathf.Cos(theta), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(theta));
                v.Add(p);
                n.Add(p);
                uv.Add(new Vector2(ut, 1f - vt));
            }
        }
        int stride = lon + 1;
        for (int y = 0; y < lat; y++)
        {
            for (int x = 0; x < lon; x++)
            {
                int i = y * stride + x;
                tris.Add(i);
                tris.Add(i + stride);
                tris.Add(i + 1);
                tris.Add(i + 1);
                tris.Add(i + stride);
                tris.Add(i + stride + 1);
            }
        }
        mesh.SetVertices(v);
        mesh.SetNormals(n);
        mesh.SetUVs(0, uv);
        mesh.SetTriangles(tris, 0);
        return mesh;
    }
}
