Shader "NeonRift/Sky"
{
    Properties
    {
        _Stars ("Stars", 2D) = "black" {}
        _SunDir ("Sun Direction", Vector) = (0, 1, 0, 0)
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Name "Sky"
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_Stars);
            SAMPLER(sampler_Stars);
            float4 _SunDir;
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.dir = IN.positionOS.xyz;
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target
            {
                float3 d = normalize(IN.dir);
                float u = atan2(d.x, d.z) / (2.0 * PI) + 0.5;
                float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
                float3 col = SAMPLE_TEXTURE2D(_Stars, sampler_Stars, float2(u, v)).rgb;
                float3 L = normalize(_SunDir.xyz);
                float sun = saturate(dot(d, L));
                col += float3(1.0, 0.94, 0.82) * pow(sun, 1400.0) * 10.0;
                col += float3(1.0, 0.78, 0.5) * pow(sun, 8.0) * 0.35;
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
