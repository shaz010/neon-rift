Shader "NeonRift/Air"
{
    Properties
    {
        _SunDir ("Sun Direction", Vector) = (0, 1, 0, 0)
        _Color ("Rim", Color) = (0.45, 0.7, 1, 1)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Name "Air"
            Tags { "LightMode"="UniversalForward" }
            Blend One One
            ZWrite Off
            Cull Back
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float4 _SunDir;
            float4 _Color;
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; float3 positionWS : TEXCOORD1; };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs p = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionCS = p.positionCS;
                OUT.positionWS = p.positionWS;
                OUT.normalWS = TransformObjectToWorldNormal(IN.normalOS);
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target
            {
                float3 N = normalize(IN.normalWS);
                float3 V = SafeNormalize(GetWorldSpaceViewDir(IN.positionWS));
                float fres = pow(1.0 - saturate(dot(N, V)), 2.4);
                float sun = pow(saturate(dot(N, normalize(_SunDir.xyz))), 1.3);
                float3 col = lerp(float3(0.25, 0.5, 1.0), float3(1.0, 0.86, 0.62), sun);
                col *= _Color.rgb;
                return half4(col * fres * (0.55 + sun), 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
