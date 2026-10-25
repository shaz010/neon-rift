using UnrealBuildTool;

public class NeonRift2SliceEditor : ModuleRules
{
	public NeonRift2SliceEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"UnrealEd",
			"AssetTools",
			"AssetRegistry",
			"MaterialEditor"
		});
	}
}
