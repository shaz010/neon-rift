#include "Modules/ModuleManager.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Materials/MaterialExpressionVectorParameter.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionConstant3Vector.h"
#include "Materials/MaterialExpressionFresnel.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "IAssetTools.h"
#include "AssetImportTask.h"
#include "MaterialEditingLibrary.h"
#include "UObject/SavePackage.h"
#include "Misc/Paths.h"

class FNeonRift2SliceEditorModule : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		BuildAssets();
	}
	virtual void ShutdownModule() override {}

	static void BuildAssets()
	{
		if (LoadObject<UMaterial>(nullptr, TEXT("/Game/Slice/M_Lit.M_Lit")))
		{
			UE_LOG(LogTemp, Display, TEXT("Ink lane materials already built."));
			return;
		}

		UTexture2D* Earth = ImportTexture(TEXT("earth.jpg"), TEXT("earth"));
		UTexture2D* Clouds = ImportTexture(TEXT("clouds.png"), TEXT("clouds"));
		UTexture2D* Stars = ImportTexture(TEXT("stars.png"), TEXT("stars"));

		UMaterial* Lit = NewMaterial(TEXT("M_Lit"));
		Lit->SetShadingModel(MSM_DefaultLit);
		AddVector(Lit, TEXT("BaseColor"), FLinearColor::White, -500, &Lit->GetEditorOnlyData()->BaseColor);
		AddVector(Lit, TEXT("Emissive"), FLinearColor::Black, -500, &Lit->GetEditorOnlyData()->EmissiveColor);
		AddScalar(Lit, TEXT("Metallic"), 0.4f, -280, &Lit->GetEditorOnlyData()->Metallic);
		AddScalar(Lit, TEXT("Roughness"), 0.5f, -80, &Lit->GetEditorOnlyData()->Roughness);
		Finish(Lit);

		UMaterial* Glow = NewMaterial(TEXT("M_Glow"));
		Glow->SetShadingModel(MSM_Unlit);
		Glow->BlendMode = BLEND_Additive;
		Glow->TwoSided = true;
		AddVector(Glow, TEXT("Color"), FLinearColor::White, -400, &Glow->GetEditorOnlyData()->EmissiveColor);
		Finish(Glow);

		if (Earth)
		{
			UMaterial* Planet = NewMaterial(TEXT("M_Planet"));
			Planet->SetShadingModel(MSM_DefaultLit);
			auto* Sample = NewObject<UMaterialExpressionTextureSample>(Planet);
			Sample->Texture = Earth;
			Sample->SamplerType = SAMPLERTYPE_Color;
			Planet->GetExpressionCollection().AddExpression(Sample);
			Planet->GetEditorOnlyData()->BaseColor.Expression = Sample;
			AddScalar(Planet, TEXT("Roughness"), 0.62f, -200, &Planet->GetEditorOnlyData()->Roughness);
			Finish(Planet);
		}
		if (Clouds)
		{
			UMaterial* Cloud = NewMaterial(TEXT("M_Clouds"));
			Cloud->SetShadingModel(MSM_Unlit);
			Cloud->BlendMode = BLEND_Translucent;
			Cloud->TwoSided = true;
			auto* Sample = NewObject<UMaterialExpressionTextureSample>(Cloud);
			Sample->Texture = Clouds;
			Sample->SamplerType = SAMPLERTYPE_Color;
			Cloud->GetExpressionCollection().AddExpression(Sample);
			Cloud->GetEditorOnlyData()->EmissiveColor.Expression = Sample;
			Cloud->GetEditorOnlyData()->Opacity.Expression = Sample;
			Cloud->GetEditorOnlyData()->Opacity.OutputIndex = 4;
			Finish(Cloud);
		}
		if (Stars)
		{
			UMaterial* Sky = NewMaterial(TEXT("M_Stars"));
			Sky->SetShadingModel(MSM_Unlit);
			Sky->TwoSided = true;
			auto* Sample = NewObject<UMaterialExpressionTextureSample>(Sky);
			Sample->Texture = Stars;
			Sample->SamplerType = SAMPLERTYPE_Color;
			Sky->GetExpressionCollection().AddExpression(Sample);
			Sky->GetEditorOnlyData()->EmissiveColor.Expression = Sample;
			Finish(Sky);
		}

		UMaterial* Air = NewMaterial(TEXT("M_Air"));
		Air->SetShadingModel(MSM_Unlit);
		Air->BlendMode = BLEND_Additive;
		auto* Fres = NewObject<UMaterialExpressionFresnel>(Air);
		Fres->Exponent = 2.4f;
		Air->GetExpressionCollection().AddExpression(Fres);
		auto* Tint = NewObject<UMaterialExpressionConstant3Vector>(Air);
		Tint->Constant = FLinearColor(0.45f, 0.7f, 1.f);
		Air->GetExpressionCollection().AddExpression(Tint);
		auto* Mul = NewObject<UMaterialExpressionMultiply>(Air);
		Mul->A.Expression = Fres;
		Mul->B.Expression = Tint;
		Air->GetExpressionCollection().AddExpression(Mul);
		Air->GetEditorOnlyData()->EmissiveColor.Expression = Mul;
		Finish(Air);

		UE_LOG(LogTemp, Display, TEXT("Ink lane materials ready. Press Play."));
	}

private:
	static UMaterial* NewMaterial(const TCHAR* Name)
	{
		const FString PackageName = FString::Printf(TEXT("/Game/Slice/%s"), Name);
		UPackage* Package = CreatePackage(*PackageName);
		return NewObject<UMaterial>(Package, Name, RF_Public | RF_Standalone);
	}

	static void AddVector(UMaterial* Mat, const TCHAR* Param, const FLinearColor& Value, int32 X, FColorMaterialInput* Input)
	{
		auto* Node = NewObject<UMaterialExpressionVectorParameter>(Mat);
		Node->ParameterName = Param;
		Node->DefaultValue = Value;
		Node->MaterialExpressionEditorX = X;
		Mat->GetExpressionCollection().AddExpression(Node);
		Input->Expression = Node;
	}

	static void AddScalar(UMaterial* Mat, const TCHAR* Param, float Value, int32 X, FScalarMaterialInput* Input)
	{
		auto* Node = NewObject<UMaterialExpressionScalarParameter>(Mat);
		Node->ParameterName = Param;
		Node->DefaultValue = Value;
		Node->MaterialExpressionEditorX = X;
		Mat->GetExpressionCollection().AddExpression(Node);
		Input->Expression = Node;
	}

	static void Finish(UMaterial* Mat)
	{
		Mat->PostEditChange();
		UMaterialEditingLibrary::RecompileMaterial(Mat);
		UPackage* Package = Mat->GetPackage();
		FAssetRegistryModule::AssetCreated(Mat);
		const FString File = FPackageName::LongPackageNameToFilename(Package->GetName(), FPackageName::GetAssetPackageExtension());
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		UPackage::SavePackage(Package, Mat, *File, Args);
	}

	static UTexture2D* ImportTexture(const TCHAR* FileName, const TCHAR* AssetName)
	{
		const FString Source = FPaths::ProjectContentDir() / TEXT("Raw/Textures") / FileName;
		if (!FPaths::FileExists(Source))
		{
			UE_LOG(LogTemp, Warning, TEXT("Missing texture %s"), *Source);
			return nullptr;
		}
		UAssetImportTask* Task = NewObject<UAssetImportTask>();
		Task->Filename = Source;
		Task->DestinationPath = TEXT("/Game/Slice");
		Task->DestinationName = AssetName;
		Task->bReplaceExisting = true;
		Task->bAutomated = true;
		Task->bSave = true;
		Task->bAsync = false;
		FAssetToolsModule& Tools = FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools"));
		Tools.Get().ImportAssetTasks({ Task });
		return LoadObject<UTexture2D>(nullptr, *FString::Printf(TEXT("/Game/Slice/%s.%s"), AssetName, AssetName));
	}
};

IMPLEMENT_MODULE(FNeonRift2SliceEditorModule, NeonRift2SliceEditor)
