using UnrealBuildTool;
using System.Collections.Generic;

public class NeonRift2SliceEditorTarget : TargetRules
{
	public NeonRift2SliceEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("NeonRift2Slice");
	}
}
