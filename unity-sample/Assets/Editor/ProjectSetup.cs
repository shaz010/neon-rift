using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace NeonRift.EditorTools
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        static ProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
                try { Ensure(); }
                catch (System.Exception e) { UnityEngine.Debug.LogException(e); }
            };
        }

        const string ScenePath = "Assets/Scenes/SampleScene.unity";

        public static void BuildLinux()
        {
            Ensure();
            Build(BuildTarget.StandaloneLinux64, "Builds/Linux/NeonRift2Slice");
        }

        public static void BuildWebGL()
        {
            Ensure();
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            Build(BuildTarget.WebGL, "Builds/WebGL");
        }

        public static void Ensure()
        {
            Directory.CreateDirectory("Assets/Settings");
            Directory.CreateDirectory("Assets/Scenes");
            Directory.CreateDirectory("Assets/Resources/Mats");
            if (!File.Exists(ScenePath))
            {
                var scene = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
                    UnityEditor.SceneManagement.NewSceneSetup.EmptyScene,
                    UnityEditor.SceneManagement.NewSceneMode.Single);
                UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, ScenePath);
            }

            var pipeline = EnsurePipeline();
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
            QualitySettings.SetQualityLevel(QualitySettings.names.Length - 1, false);
            QualitySettings.vSyncCount = 0;
            QualitySettings.antiAliasing = 0;

            EnsureMaterial("Glow", "NeonRift/Glow");
            EnsureMaterial("Planet", "NeonRift/Planet");
            EnsureMaterial("Clouds", "NeonRift/Clouds");
            EnsureMaterial("Air", "NeonRift/Air");
            EnsureMaterial("Sky", "NeonRift/Sky");
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            if (lit != null) EnsureMaterial("Lit", lit);

            PlayerSettings.companyName = "Neon Rift";
            PlayerSettings.productName = "Neon Rift 2 Ink Lane";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneLinux64, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneLinux64, new[] { GraphicsDeviceType.OpenGLCore });
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.WebGL, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetIl2CppCompilerConfiguration(NamedBuildTarget.Standalone, Il2CppCompilerConfiguration.Release);
            PlayerSettings.activeInputHandler = (PlayerSettings.ActiveInputHandler)0;

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("Ink lane project settings ready.");
        }

        static void Build(BuildTarget target, string path)
        {
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = path,
                target = target,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError("Build failed: " + report.summary.result);
                EditorApplication.Exit(1);
                return;
            }
            Debug.Log("Build succeeded: " + path);
            EditorApplication.Exit(0);
        }

        static UniversalRenderPipelineAsset EnsurePipeline()
        {
            const string path = "Assets/Settings/InkLaneURP.asset";
            var existing = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
            if (existing != null) return existing;
            // The cross-platform URP template ships a configured renderer. A blank
            // UniversalRendererData renders an empty frame, so prefer that asset.
            var pc = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Settings/PC_RPAsset.asset");
            if (pc != null) return pc;

            var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
            AssetDatabase.CreateAsset(renderer, "Assets/Settings/InkLaneRenderer.asset");
            UniversalRenderPipelineAsset asset = null;
            var create = typeof(UniversalRenderPipelineAsset).GetMethod(
                "Create",
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                null,
                new[] { typeof(ScriptableRendererData) },
                null);
            if (create != null)
                asset = create.Invoke(null, new object[] { renderer }) as UniversalRenderPipelineAsset;
            if (asset == null)
            {
                asset = ScriptableObject.CreateInstance<UniversalRenderPipelineAsset>();
                var so = new SerializedObject(asset);
                var list = so.FindProperty("m_RendererDataList");
                if (list != null)
                {
                    list.arraySize = 1;
                    list.GetArrayElementAtIndex(0).objectReferenceValue = renderer;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
            }
            asset.msaaSampleCount = 2;
            var supports = typeof(UniversalRenderPipelineAsset).GetProperty("supportsHDR");
            if (supports != null && supports.CanWrite) supports.SetValue(asset, true);
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        static void EnsureMaterial(string name, string shaderName)
        {
            var shader = Shader.Find(shaderName);
            if (shader == null)
            {
                Debug.LogWarning("Missing shader " + shaderName);
                return;
            }
            EnsureMaterial(name, shader);
        }

        static void EnsureMaterial(string name, Shader shader)
        {
            string path = "Assets/Resources/Mats/" + name + ".mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) return;
            var mat = new Material(shader) { name = name };
            AssetDatabase.CreateAsset(mat, path);
        }
    }
}
