using UnrealBuildTool;

public class NeonRift2Slice : ModuleRules
{
	public NeonRift2Slice(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"ProceduralMeshComponent",
			"RenderCore"
		});
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"ImageWrapper"
		});
	}
}
