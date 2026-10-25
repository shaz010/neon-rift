#include "ObjUtil.h"

#include "ProceduralMeshComponent.h"
#include "SliceTypes.h"
#include "Misc/FileHelper.h"

namespace
{
	struct FSection
	{
		FString Name;
		TArray<FVector> Vertices;
		TArray<int32> Triangles;
		TArray<FVector> Normals;
		TArray<FVector2D> UV;
		TArray<FLinearColor> Colors;
	};

	FVector ParseV(const FString& Line)
	{
		TArray<FString> Parts;
		Line.ParseIntoArrayWS(Parts);
		return FVector(
			Parts.Num() > 1 ? FCString::Atof(*Parts[1]) : 0.f,
			Parts.Num() > 2 ? FCString::Atof(*Parts[2]) : 0.f,
			Parts.Num() > 3 ? FCString::Atof(*Parts[3]) : 0.f);
	}
}

void InkLaneLoadShip(UProceduralMeshComponent* Mesh, const FString& ObjPath, float TargetLengthMeters,
	UMaterialInterface* Hull, UMaterialInterface* Dark, UMaterialInterface* Engine)
{
	if (!Mesh) return;
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *ObjPath))
	{
		UE_LOG(LogTemp, Warning, TEXT("Ink lane missing ship %s"), *ObjPath);
		return;
	}

	TArray<FVector> V;
	TArray<FVector2D> VT;
	TArray<FVector> VN;
	TArray<FSection> Sections;
	auto Section = [&Sections](const FString& Name) -> FSection&
	{
		if (Sections.Num() == 0 || Sections.Last().Name != Name)
		{
			FSection NewSection;
			NewSection.Name = Name;
			Sections.Add(NewSection);
		}
		return Sections.Last();
	};
	FString Current = TEXT("metal");

	TArray<FString> Lines;
	Text.ParseIntoArrayLines(Lines);
	for (const FString& Raw : Lines)
	{
		FString Line = Raw.TrimStartAndEnd();
		if (Line.StartsWith(TEXT("usemtl ")))
		{
			Current = Line.Mid(7).TrimStartAndEnd();
		}
		else if (Line.StartsWith(TEXT("v ")))
		{
			V.Add(ParseV(Line));
		}
		else if (Line.StartsWith(TEXT("vt ")))
		{
			const FVector T = ParseV(Line);
			VT.Add(FVector2D(T.X, T.Y));
		}
		else if (Line.StartsWith(TEXT("vn ")))
		{
			VN.Add(ParseV(Line));
		}
		else if (Line.StartsWith(TEXT("f ")))
		{
			TArray<FString> Face;
			Line.ParseIntoArrayWS(Face);
			if (Face.Num() < 4) continue;
			int32 Idx[3];
			FVector2D UVs[3];
			FVector Ns[3];
			for (int32 c = 0; c < 3; ++c)
			{
				TArray<FString> Bits;
				Face[c + 1].ParseIntoArray(Bits, TEXT("/"), false);
				Idx[c] = Bits.Num() > 0 ? FCString::Atoi(*Bits[0]) - 1 : 0;
				const int32 UVIndex = Bits.Num() > 1 && !Bits[1].IsEmpty() ? FCString::Atoi(*Bits[1]) - 1 : -1;
				const int32 NIndex = Bits.Num() > 2 ? FCString::Atoi(*Bits[2]) - 1 : -1;
				UVs[c] = VT.IsValidIndex(UVIndex) ? VT[UVIndex] : FVector2D::ZeroVector;
				Ns[c] = VN.IsValidIndex(NIndex) ? VN[NIndex] : FVector::UpVector;
			}
			FSection& S = Section(Current);
			const int32 Base = S.Vertices.Num();
			for (int32 c = 0; c < 3; ++c)
			{
				const FVector P = V.IsValidIndex(Idx[c]) ? V[Idx[c]] : FVector::ZeroVector;
				S.Vertices.Add(P);
				S.UV.Add(UVs[c]);
				S.Normals.Add(Ns[c]);
				S.Colors.Add(FLinearColor::White);
			}
			S.Triangles.Add(Base);
			S.Triangles.Add(Base + 1);
			S.Triangles.Add(Base + 2);
		}
	}

	FBox Bounds(ForceInit);
	for (const FVector& P : V) Bounds += P;
	const float Length = FMath::Max(0.01f, Bounds.GetSize().Z);
	const float Scale = TargetLengthMeters / Length;
	const FVector Center = Bounds.GetCenter();

	int32 SectionIndex = 0;
	for (FSection& S : Sections)
	{
		for (int32 i = 0; i < S.Vertices.Num(); ++i)
		{
			const FVector Local = (S.Vertices[i] - Center) * Scale;
			S.Vertices[i] = InkLane::ToUE(Local);
			S.Normals[i] = InkLane::ToUEDir(S.Normals[i]).GetSafeNormal();
		}
		TArray<FProcMeshTangent> Tangents;
		Mesh->CreateMeshSection_LinearColor(SectionIndex, S.Vertices, S.Triangles, S.Normals, S.UV, S.Colors, Tangents, false);
		const FString Lower = S.Name.ToLower();
		UMaterialInterface* Mat = Hull;
		if (Lower.Contains(TEXT("red"))) Mat = Engine;
		else if (Lower.Contains(TEXT("dark"))) Mat = Dark;
		if (Mat) Mesh->SetMaterial(SectionIndex, Mat);
		++SectionIndex;
	}
}
