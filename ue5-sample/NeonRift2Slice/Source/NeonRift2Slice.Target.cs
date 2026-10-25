using UnrealBuildTool;
using System.Collections.Generic;

public class NeonRift2SliceTarget : TargetRules
{
	public NeonRift2SliceTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("NeonRift2Slice");
	}
}
