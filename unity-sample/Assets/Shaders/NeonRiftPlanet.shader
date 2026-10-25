Shader "NeonRift/Planet"
{
    Properties
    {
        _MainTex ("Albedo", 2D) = "white" {}
        _SunDir ("Sun Direction", Vector) = (0, 1, 0, 0)
        _SunColor ("Sun Color", Color) = (1, 0.96, 0.9, 1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Name "Planet"
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                float4 _SunDir;
                float4 _SunColor;
            CBUFFER_END
            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float2 uv : TEXCOORD2;
            };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs p = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = p.positionCS;
                OUT.positionWS = p.positionWS;
                OUT.normalWS = TransformObjectToWorldNormal(IN.normalOS);
                OUT.uv = TRANSFORM_TEX(IN.uv, _MainTex);
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target
            {
                float3 N = normalize(IN.normalWS);
                float3 V = SafeNormalize(GetWorldSpaceViewDir(IN.positionWS));
                float3 L = normalize(_SunDir.xyz);
                float ndl = dot(N, L);
                float wrap = saturate(ndl * 0.62 + 0.38);
                float3 albedo = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, IN.uv).rgb;
                float ocean = saturate((albedo.b - albedo.r) * 1.8);
                float3 H = normalize(L + V);
                float spec = pow(saturate(dot(N, H)), 70.0) * ocean * 0.28;
                float3 col = albedo * wrap * _SunColor.rgb + spec * _SunColor.rgb;
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
