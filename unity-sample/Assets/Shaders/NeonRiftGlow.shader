Shader "NeonRift/Glow"
{
    // Ink, wakes, lances, seals, novas. Vertex color tints the cast.
    Properties
    {
        _Color ("Color", Color) = (1, 1, 1, 1)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Name "Glow"
            Tags { "LightMode"="UniversalForward" }
            Blend SrcAlpha One
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float4 _Color;
            struct Attributes { float4 positionOS : POSITION; float4 color : COLOR; };
            struct Varyings { float4 positionCS : SV_POSITION; float4 color : COLOR; };
            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                float4 tint = IN.color;
                if (dot(tint.rgb, float3(1, 1, 1)) < 0.001) tint = float4(1, 1, 1, 1);
                OUT.color = tint * _Color;
                return OUT;
            }
            half4 frag(Varyings IN) : SV_Target { return IN.color; }
            ENDHLSL
        }
    }
    FallBack Off
}
