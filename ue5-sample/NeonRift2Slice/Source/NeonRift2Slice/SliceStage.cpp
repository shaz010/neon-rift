#include "SliceStage.h"

#include "SlicePawn.h"
#include "SliceTypes.h"
#include "ObjUtil.h"
#include "ProceduralMeshComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/App.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "UnrealClient.h"
#include "ImageUtils.h"

namespace
{
	constexpr const TCHAR* GlyphName[] = { TEXT("LANCE"), TEXT("SEAL"), TEXT("NOVA") };
	constexpr const TCHAR* GlyphPayoff[] = { TEXT("HIT"), TEXT("BOUND"), TEXT("SHATTERED") };

	UProceduralMeshComponent* AddProc(AActor* Owner, const FName& Name)
	{
		const FName Unique = MakeUniqueObjectName(Owner, UProceduralMeshComponent::StaticClass(), Name);
		auto* Mesh = NewObject<UProceduralMeshComponent>(Owner, Unique);
		Mesh->SetupAttachment(Owner->GetRootComponent());
		Mesh->RegisterComponent();
		return Mesh;
	}

	void BuildSphere(UProceduralMeshComponent* Mesh, float RadiusCm, bool bFlip, UMaterialInterface* Mat)
	{
		constexpr int32 Lat = 40;
		constexpr int32 Lon = 80;
		TArray<FVector> V;
		TArray<FVector> N;
		TArray<FVector2D> UV;
		TArray<int32> Tris;
		TArray<FLinearColor> Colors;
		for (int32 Y = 0; Y <= Lat; ++Y)
		{
			const float VT = (float)Y / Lat;
			const float Phi = VT * PI;
			for (int32 X = 0; X <= Lon; ++X)
			{
				const float UT = (float)X / Lon;
				const float Theta = UT * 2.f * PI;
				const FVector P(FMath::Sin(Phi) * FMath::Cos(Theta), FMath::Sin(Phi) * FMath::Sin(Theta), FMath::Cos(Phi));
				V.Add(P * RadiusCm);
				N.Add(bFlip ? -P : P);
				UV.Add(FVector2D(UT, 1.f - VT));
				Colors.Add(FLinearColor::White);
			}
		}
		const int32 Stride = Lon + 1;
		for (int32 Y = 0; Y < Lat; ++Y)
		{
			for (int32 X = 0; X < Lon; ++X)
			{
				const int32 I = Y * Stride + X;
				if (!bFlip)
				{
					Tris.Append({ I, I + Stride, I + 1, I + 1, I + Stride, I + Stride + 1 });
				}
				else
				{
					Tris.Append({ I, I + 1, I + Stride, I + 1, I + Stride + 1, I + Stride });
				}
			}
		}
		TArray<FProcMeshTangent> Tangents;
		Mesh->CreateMeshSection_LinearColor(0, V, Tris, N, UV, Colors, Tangents, false);
		if (Mat) Mesh->SetMaterial(0, Mat);
	}

	UDirectionalLightComponent* AddSun(UWorld* World, const FVector& ShineDir, float Intensity, const FLinearColor& Color)
	{
		AActor* Actor = World->SpawnActor<AActor>();
		auto* Light = NewObject<UDirectionalLightComponent>(Actor);
		Light->SetIntensity(Intensity);
		Light->SetLightColor(Color);
		Light->SetCastShadows(false);
		Light->SetMobility(EComponentMobility::Movable);
		Actor->SetRootComponent(Light);
		Light->RegisterComponent();
		Light->SetWorldRotation(FRotationMatrix::MakeFromX(ShineDir.GetSafeNormal()).Rotator());
		return Light;
	}
}

void ASliceStage::FWake::Push(const FVector& P)
{
	Points.Add(P);
	if (Points.Num() > 48) Points.RemoveAt(0);
}

float ASliceStage::FWake::Distance(const FVector& P) const
{
	float Best = 999.f;
	for (int32 i = 1; i < Points.Num(); ++i)
	{
		const FVector AB = Points[i] - Points[i - 1];
		const float Den = FVector::DotProduct(AB, AB);
		const float T = Den < 1e-5f ? 0.f : FMath::Clamp(FVector::DotProduct(P - Points[i - 1], AB) / Den, 0.f, 1.f);
		Best = FMath::Min(Best, FVector::Dist(P, Points[i - 1] + AB * T));
	}
	return Best;
}

ASliceStage::ASliceStage()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostPhysics;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

void ASliceStage::BeginPlay()
{
	Super::BeginPlay();
	FString Dir;
	if (FParse::Value(FCommandLine::Get(), TEXT("CaptureDir="), Dir))
	{
		bCapture = true;
		CaptureDir = Dir;
		IFileManager::Get().MakeDirectory(*CaptureDir, true);
		FApp::SetUseFixedTimeStep(true);
		FApp::SetFixedDeltaTime(1.0 / InkLane::Fps);
	}
	EndFrameHandle = FCoreDelegates::OnEndFrame.AddUObject(this, &ASliceStage::OnEndFrame);
	Pawn = Cast<ASlicePawn>(UGameplayStatics::GetPlayerPawn(this, 0));
	CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	SphereMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	LitParent = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Lit.M_Lit"));
	GlowParent = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Glow.M_Glow"));
	if (!LitParent)
	{
		UE_LOG(LogTemp, Warning, TEXT("Ink lane materials are missing. Open the project in the editor once so they can be built, then press Play."));
	}
	BuildWorld();
	BeginRun();
}

void ASliceStage::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	FCoreDelegates::OnEndFrame.Remove(EndFrameHandle);
	Super::EndPlay(EndPlayReason);
}

UMaterialInstanceDynamic* ASliceStage::LitMID(const FLinearColor& Base, const FLinearColor& Emissive, float Metallic, float Rough)
{
	UMaterialInterface* Parent = LitParent ? LitParent : UMaterial::GetDefaultMaterial(MD_Surface);
	auto* Mid = UMaterialInstanceDynamic::Create(Parent, this);
	Mid->SetVectorParameterValue(TEXT("BaseColor"), Base);
	Mid->SetVectorParameterValue(TEXT("Emissive"), Emissive);
	Mid->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	Mid->SetScalarParameterValue(TEXT("Roughness"), Rough);
	return Mid;
}

UMaterialInstanceDynamic* ASliceStage::GlowMID(const FLinearColor& Color)
{
	UMaterialInterface* Parent = GlowParent ? GlowParent : UMaterial::GetDefaultMaterial(MD_Surface);
	auto* Mid = UMaterialInstanceDynamic::Create(Parent, this);
	Mid->SetVectorParameterValue(TEXT("Color"), Color);
	return Mid;
}

void ASliceStage::BuildWorld()
{
	UWorld* World = GetWorld();
	const FVector Shine = InkLane::ToUEDir(-InkLane::SunDir());
	AddSun(World, Shine, 12.f, FLinearColor(1.f, 0.96f, 0.9f));
	AddSun(World, -Shine, 1.4f, FLinearColor(0.45f, 0.62f, 0.85f));

	UMaterialInterface* PlanetMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Planet.M_Planet"));
	UMaterialInterface* CloudMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Clouds.M_Clouds"));
	UMaterialInterface* StarMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Stars.M_Stars"));
	UMaterialInterface* AirMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Slice/M_Air.M_Air"));

	Planet = AddProc(this, TEXT("Planet"));
	BuildSphere(Planet, InkLane::PlanetRadius * 100.f, false, PlanetMat);
	Planet->SetWorldLocation(InkLane::ToUE(InkLane::PlanetCenter()));

	Clouds = AddProc(this, TEXT("Clouds"));
	BuildSphere(Clouds, InkLane::PlanetRadius * 1.012f * 100.f, false, CloudMat);
	Clouds->SetWorldLocation(Planet->GetComponentLocation());

	auto* Air = AddProc(this, TEXT("Air"));
	BuildSphere(Air, InkLane::PlanetRadius * 1.04f * 100.f, false, AirMat);
	Air->SetWorldLocation(Planet->GetComponentLocation());

	auto* Stars = AddProc(this, TEXT("Stars"));
	BuildSphere(Stars, 2500000.f, true, StarMat);

	if (Pawn && Pawn->Camera)
	{
		Pawn->Camera->PostProcessSettings.bOverride_AutoExposureMethod = true;
		Pawn->Camera->PostProcessSettings.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
		Pawn->Camera->PostProcessSettings.bOverride_AutoExposureBias = true;
		Pawn->Camera->PostProcessSettings.AutoExposureBias = 1.f;
		Pawn->Camera->PostProcessSettings.bOverride_BloomIntensity = true;
		Pawn->Camera->PostProcessSettings.BloomIntensity = 0.65f;
		Pawn->Camera->PostProcessSettings.bOverride_VignetteIntensity = true;
		Pawn->Camera->PostProcessSettings.VignetteIntensity = 0.35f;
		Pawn->Camera->SetFieldOfView(56.f);
	}
}

void ASliceStage::BeginRun()
{
	for (FLance& L : Lances) if (L.Body) L.Body->DestroyComponent();
	for (FSeal& S : Seals) if (S.Ring) S.Ring->DestroyComponent();
	for (FNova& N : Novas)
	{
		if (N.Bloom) N.Bloom->DestroyComponent();
		if (N.Ring) N.Ring->DestroyComponent();
	}
	for (FChunk& C : Chunks) if (C.Body) C.Body->DestroyComponent();
	Lances.Empty();
	Seals.Empty();
	Novas.Empty();
	Chunks.Empty();
	Sim = 0.f;
	Shield = 1.f;
	HurtCd = 0.f;
	Sealed = 0;
	Armed = -1;
	ArmedTarget = -1;
	bRunning = true;
	bGrazeA = bGrazeB = bGrazeC = false;
	bCastA = bCastB = bCastC = false;
	PlayerInk.Points.Empty();
	if (PlayerInk.Mesh) PlayerInk.Mesh->DestroyComponent();
	PlayerInk.Mesh = AddProc(this, TEXT("PlayerInk"));

	const FString Raw = FPaths::ProjectContentDir() / TEXT("Raw/Ships");
	if (Pawn && Pawn->Ship)
	{
		Pawn->Ship->ClearAllMeshSections();
		InkLaneLoadShip(Pawn->Ship, Raw / TEXT("craft_racer.obj"), 8.2f,
			LitMID(FLinearColor(0.78f, 0.86f, 0.93f), FLinearColor::Black, 0.7f, 0.58f),
			LitMID(FLinearColor(0.16f, 0.2f, 0.28f), FLinearColor::Black, 0.5f, 0.42f),
			LitMID(InkLane::Teal(), InkLane::Teal() * 4.f, 0.2f, 0.4f));
	}

	const TCHAR* Names[] = { TEXT("craft_speederA.obj"), TEXT("craft_speederB.obj"), TEXT("craft_speederC.obj") };
	if (Raiders.Num() == 0)
	{
		for (int32 i = 0; i < 3; ++i)
		{
			FRaider R;
			R.Index = i;
			R.Body = AddProc(this, *FString::Printf(TEXT("Raider%d"), i));
			R.Core.Mesh = AddProc(this, *FString::Printf(TEXT("Core%d"), i));
			R.Halo.Mesh = AddProc(this, *FString::Printf(TEXT("Halo%d"), i));
			Raiders.Add(R);
		}
	}
	for (int32 i = 0; i < 3; ++i)
	{
		FRaider& R = Raiders[i];
		R.bAlive = true;
		R.Core.Points.Empty();
		R.Halo.Points.Empty();
		R.Body->SetVisibility(true);
		R.Body->ClearAllMeshSections();
		InkLaneLoadShip(R.Body, Raw / Names[i], 7.1f,
			LitMID(FLinearColor(0.28f, 0.32f, 0.4f), FLinearColor::Black, 0.55f, 0.45f),
			LitMID(FLinearColor(0.1f, 0.12f, 0.16f), FLinearColor::Black, 0.4f, 0.4f),
			LitMID(InkLane::Coral(), InkLane::Coral() * 4.f, 0.2f, 0.35f));
	}
}

void ASliceStage::Tick(float DeltaSeconds)
{
	const float Dt = bCapture ? (1.f / InkLane::Fps) : FMath::Clamp(DeltaSeconds, 0.0001f, 0.05f);
	TickSim(Dt);
	if (bCapture) bShotPending = true;
}

void ASliceStage::TickSim(float Dt)
{
	const float Prev = Sim;
	Sim += Dt;
	if (Pawn)
	{
		const FVector2D Target = bCapture ? InkLane::ScriptedWeave(Sim) : Pawn->WeaveMeters();
		Weave = FMath::Lerp(Weave, Target, 1.f - FMath::Exp(-7.5f * Dt));
		if (!bCapture && Pawn->ConsumeCast()) TryCast();
		if (!bCapture && Sealed >= 3 && Pawn->ConsumeReset()) BeginRun();
	}
	PlayerPos = InkLane::Lane(Sim) + FVector(Weave.X, Weave.Y, 0.f);
	if (Pawn)
	{
		const FVector Forward = InkLane::ToUEDir(FVector(Weave.X * 0.03f, Weave.Y * 0.03f, 1.f)).GetSafeNormal();
		Pawn->SetActorLocation(InkLane::ToUE(PlayerPos));
		Pawn->SetActorRotation(FRotationMatrix::MakeFromXZ(Forward, FVector::UpVector).Rotator());
		const FVector Look = InkLane::ToUE(PlayerPos + FVector(16.f, -2.5f, 48.f));
		FVector Desired = InkLane::ToUE(PlayerPos + FVector(-3.2f, 5.4f, -15.5f));
		if (Shake > 0.f) Desired += FMath::VRand() * Shake * 45.f;
		Pawn->Camera->SetWorldLocation(FMath::VInterpTo(Pawn->Camera->GetComponentLocation(), Desired, Dt, 4.5f));
		Pawn->Camera->SetWorldRotation((Look - Pawn->Camera->GetComponentLocation()).Rotation());
	}
	PlayerInk.Push(PlayerPos - FVector(0.f, 0.4f, 3.2f));
	WriteRibbon(PlayerInk.Mesh, PlayerInk.Points, 1.15f, GlowMID(InkLane::Teal()));

	for (FRaider& R : Raiders)
	{
		if (!R.bAlive) continue;
		R.Pos = InkLane::RaiderPos(R.Index, Sim);
		const FVector Forward = InkLane::ToUEDir(FVector::ForwardVector);
		R.Body->SetWorldLocation(InkLane::ToUE(R.Pos));
		R.Body->SetWorldRotation(FRotationMatrix::MakeFromXZ(Forward, FVector::UpVector).Rotator());
		R.Core.Push(R.Pos);
		R.Halo.Push(R.Pos);
		WriteRibbon(R.Core.Mesh, R.Core.Points, 1.5f, GlowMID(InkLane::Coral()));
		WriteRibbon(R.Halo.Mesh, R.Halo.Points, 7.f, GlowMID(InkLane::Teal()));
		if (!bCapture && Armed < 0 && bRunning)
		{
			const float D = R.Halo.Distance(PlayerPos);
			if (D < InkLane::CoreRadius && HurtCd <= 0.f)
			{
				Shield = FMath::Max(0.f, Shield - 0.28f);
				HurtCd = 0.55f;
				Say(TEXT("WAKE"), TEXT("THE CORE TOOK INK"), InkLane::Coral(), 0.8f);
				Shake = FMath::Max(Shake, 0.35f);
				if (Shield <= 0.f)
				{
					bRunning = false;
					Say(TEXT("WAKE"), TEXT("THE CORE TOOK THE SHIP"), InkLane::Coral(), 2.f);
					FTimerHandle Handle;
					GetWorldTimerManager().SetTimer(Handle, this, &ASliceStage::BeginRun, 1.6f, false);
				}
			}
			else if (D < InkLane::HaloRadius)
			{
				Wet(R.Index, D);
			}
		}
	}

	for (int32 i = Lances.Num() - 1; i >= 0; --i)
	{
		FLance& L = Lances[i];
		L.Life -= Dt;
		L.Pos += L.Dir * (210.f * Dt);
		if (L.Body)
		{
			L.Body->SetWorldLocation(InkLane::ToUE(L.Pos));
			L.Body->SetWorldRotation(InkLane::ToUEDir(L.Dir).Rotation());
		}
		const bool bHit = Raiders.IsValidIndex(L.Target) && Raiders[L.Target].bAlive && FVector::Dist(L.Pos, Raiders[L.Target].Pos) < 4.2f;
		if (bHit || L.Life <= 0.f)
		{
			if (bHit) Payoff(L.Target, 0, InkLane::Lavender(), 10);
			if (L.Body) L.Body->DestroyComponent();
			Lances.RemoveAt(i);
		}
	}
	for (int32 i = Seals.Num() - 1; i >= 0; --i)
	{
		FSeal& S = Seals[i];
		S.Age += Dt;
		const float U = FMath::Clamp(S.Age / 0.48f, 0.f, 1.f);
		const float Radius = FMath::Lerp(8.5f, 0.7f, U * U);
		if (Raiders.IsValidIndex(S.Target)) WriteCircle(S.Ring, Raiders[S.Target].Pos, Radius, GlowMID(InkLane::Teal()));
		if (U >= 1.f)
		{
			Payoff(S.Target, 1, InkLane::Teal(), 12);
			if (S.Ring) S.Ring->DestroyComponent();
			Seals.RemoveAt(i);
		}
	}
	for (int32 i = Novas.Num() - 1; i >= 0; --i)
	{
		FNova& N = Novas[i];
		N.Age += Dt;
		const float U = FMath::Clamp(N.Age / 0.7f, 0.f, 1.f);
		if (N.Bloom && Raiders.IsValidIndex(N.Target))
		{
			N.Bloom->SetWorldLocation(InkLane::ToUE(Raiders[N.Target].Pos));
			N.Bloom->SetWorldScale3D(FVector(FMath::Lerp(0.4f, 19.f, U)));
		}
		if (Raiders.IsValidIndex(N.Target)) WriteCircle(N.Ring, Raiders[N.Target].Pos, FMath::Lerp(1.f, 18.f, U), GlowMID(InkLane::Amber()));
		if (!N.bBurst && N.Age > 0.12f)
		{
			N.bBurst = true;
			Payoff(N.Target, 2, InkLane::Amber(), 16);
		}
		if (N.Age > 0.85f)
		{
			if (N.Bloom) N.Bloom->DestroyComponent();
			if (N.Ring) N.Ring->DestroyComponent();
			Novas.RemoveAt(i);
		}
	}
	for (int32 i = Chunks.Num() - 1; i >= 0; --i)
	{
		FChunk& C = Chunks[i];
		C.V *= FMath::Exp(-0.35f * Dt);
		C.PosMeters += C.V * Dt;
		C.Life -= Dt;
		if (C.Body)
		{
			C.Body->SetWorldLocation(InkLane::ToUE(C.PosMeters));
			C.Body->AddWorldRotation(FRotator(C.Spin.Y * Dt * 40.f, C.Spin.Z * Dt * 40.f, C.Spin.X * Dt * 40.f));
			if (C.Life < 0.5f) C.Body->SetWorldScale3D(FVector(FMath::Clamp(C.Life / 0.5f, 0.f, 1.f) * 0.4f));
		}
		if (C.Life <= 0.f)
		{
			if (C.Body) C.Body->DestroyComponent();
			Chunks.RemoveAt(i);
		}
	}

	if (bCapture)
	{
		auto Cross = [&](bool& Flag, float When, TFunction<void()> Fn)
		{
			if (!Flag && Prev < When && Sim >= When) { Flag = true; Fn(); }
		};
		Cross(bGrazeA, InkLane::GrazeA, [this]() { UE_LOG(LogTemp, Display, TEXT("force-graze 0 dist=%f"), Raiders.IsValidIndex(0) ? Raiders[0].Halo.Distance(PlayerPos) : -1.f); Wet(0, InkLane::HaloRadius - 0.4f); });
		Cross(bGrazeB, InkLane::GrazeB, [this]() { Wet(1, InkLane::HaloRadius - 0.4f); });
		Cross(bGrazeC, InkLane::GrazeC, [this]() { Wet(2, InkLane::HaloRadius - 0.4f); });
		Cross(bCastA, InkLane::CastA, [this]() { TryCast(); });
		Cross(bCastB, InkLane::CastB, [this]() { TryCast(); });
		Cross(bCastC, InkLane::CastC, [this]() { TryCast(); });
	}

	if (HurtCd > 0.f) HurtCd -= Dt;
	BannerT = FMath::Max(0.f, BannerT - Dt);
	Shake = FMath::Max(0.f, Shake - Dt * 2.4f);
	if (Planet) Planet->AddWorldRotation(FRotator(0.f, 0.35f * Dt, 0.f));
	if (Clouds) Clouds->AddWorldRotation(FRotator(0.f, -0.22f * Dt, 0.f));
	Present();
}

void ASliceStage::Wet(int32 Index, float Dist)
{
	if (!Raiders.IsValidIndex(Index) || !Raiders[Index].bAlive || Armed >= 0) return;
	const float Tight = FMath::GetRangePct(InkLane::HaloRadius, InkLane::CoreRadius + 0.15f, Dist);
	Power = FMath::Lerp(1.f, 3.f, FMath::Clamp(Tight, 0.f, 1.f));
	Armed = bCapture ? Index : (Sealed % 3);
	ArmedTarget = Index;
	Say(TEXT("GRAZE"), TEXT("INK IS WET"), InkLane::Teal(), 0.9f);
	UE_LOG(LogTemp, Display, TEXT("GRAZE raider=%d dist=%f power=%f sim=%f"), Index, Dist, Power, Sim);
}

void ASliceStage::TryCast()
{
	if (Sealed >= 3) { if (!bCapture) BeginRun(); return; }
	if (Armed < 0 || !Raiders.IsValidIndex(ArmedTarget) || !Raiders[ArmedTarget].bAlive)
	{
		Say(TEXT("GRAZE"), TEXT("NEAR-MISS WHILE THE INK IS WET"), InkLane::Sky(), 0.85f);
		return;
	}
	const int32 Glyph = Armed;
	const int32 Target = ArmedTarget;
	Armed = -1;
	ArmedTarget = -1;
	if (Glyph == 0)
	{
		FLance L;
		L.Target = Target;
		L.Dir = (Raiders[Target].Pos - PlayerPos).GetSafeNormal();
		L.Pos = PlayerPos + L.Dir * 3.f;
		L.Life = 1.4f;
		L.Body = NewObject<UStaticMeshComponent>(this);
		L.Body->SetStaticMesh(CubeMesh);
		L.Body->SetMaterial(0, GlowMID(InkLane::Lavender()));
		L.Body->SetWorldScale3D(FVector(4.5f + Power, 0.18f, 0.18f));
		L.Body->RegisterComponent();
		Lances.Add(L);
		Say(TEXT("LANCE"), FString::Printf(TEXT("POWER %.0f"), Power), InkLane::Lavender(), 0.7f);
	}
	else if (Glyph == 1)
	{
		FSeal S;
		S.Target = Target;
		S.Ring = AddProc(this, TEXT("SealRing"));
		Seals.Add(S);
		Say(TEXT("SEAL"), FString::Printf(TEXT("POWER %.0f"), Power), InkLane::Teal(), 0.7f);
	}
	else
	{
		FNova N;
		N.Target = Target;
		N.Bloom = NewObject<UStaticMeshComponent>(this);
		N.Bloom->SetStaticMesh(SphereMesh);
		N.Bloom->SetMaterial(0, GlowMID(InkLane::Amber()));
		N.Bloom->RegisterComponent();
		N.Ring = AddProc(this, TEXT("NovaRing"));
		Novas.Add(N);
		Say(TEXT("NOVA"), FString::Printf(TEXT("POWER %.0f"), Power), InkLane::Amber(), 0.9f);
		Shake = FMath::Max(Shake, 0.7f);
	}
	UE_LOG(LogTemp, Display, TEXT("CAST %s at %d sim=%f"), GlyphName[Glyph], Target, Sim);
}

void ASliceStage::Payoff(int32 Index, int32 Glyph, const FLinearColor& Ink, int32 Bits)
{
	if (!Raiders.IsValidIndex(Index) || !Raiders[Index].bAlive) return;
	Raiders[Index].bAlive = false;
	Raiders[Index].Body->SetVisibility(false);
	++Sealed;
	Burst(Raiders[Index].Pos, Ink, Bits);
	Say(GlyphName[Glyph], GlyphPayoff[Glyph], Ink, 1.1f);
	Shake = FMath::Max(Shake, Glyph == 2 ? 0.85f : 0.4f);
	UE_LOG(LogTemp, Display, TEXT("PAYOFF %s sealed=%d sim=%f"), GlyphName[Glyph], Sealed, Sim);
}

void ASliceStage::Burst(const FVector& At, const FLinearColor& Ink, int32 Count)
{
	for (int32 i = 0; i < Count; ++i)
	{
		FChunk C;
		C.PosMeters = At + FMath::VRand() * 0.7f;
		C.V = FVector(0.f, 0.f, InkLane::Cruise) * 0.25f + FMath::VRand() * FMath::FRandRange(7.f, 18.f);
		C.Spin = FMath::VRand() * 6.f;
		C.Life = FMath::FRandRange(2.4f, 3.8f);
		C.Body = NewObject<UStaticMeshComponent>(this);
		C.Body->SetStaticMesh(CubeMesh);
		const bool bHot = (i % 2) == 0;
		C.Body->SetMaterial(0, bHot ? (UMaterialInterface*)GlowMID(Ink) : (UMaterialInterface*)LitMID(FLinearColor(0.2f, 0.23f, 0.28f), FLinearColor::Black, 0.65f, 0.4f));
		const float S = FMath::FRandRange(0.22f, 0.62f);
		C.Body->SetWorldScale3D(FVector(S * 1.35f, S, S * 0.55f));
		C.Body->RegisterComponent();
		Chunks.Add(C);
	}
}

void ASliceStage::WriteRibbon(UProceduralMeshComponent* Mesh, const TArray<FVector>& Points, float WidthMeters, UMaterialInterface* Mat)
{
	if (!Mesh) return;
	TArray<FVector> V, N;
	TArray<int32> Tris;
	TArray<FVector2D> UV;
	TArray<FLinearColor> Colors;
	if (Points.Num() >= 2)
	{
		for (int32 i = 0; i < Points.Num(); ++i)
		{
			const FVector P = InkLane::ToUE(Points[i]);
			const FVector A = InkLane::ToUE(Points[FMath::Max(0, i - 1)]);
			const FVector B = InkLane::ToUE(Points[FMath::Min(Points.Num() - 1, i + 1)]);
			FVector Side = FVector::CrossProduct((B - A).GetSafeNormal(), FVector::UpVector).GetSafeNormal();
			if (Side.IsNearlyZero()) Side = FVector::RightVector;
			const float W = WidthMeters * 50.f;
			V.Add(P - Side * W);
			V.Add(P + Side * W);
			N.Add(FVector::UpVector);
			N.Add(FVector::UpVector);
			UV.Add(FVector2D(0.f, (float)i));
			UV.Add(FVector2D(1.f, (float)i));
			Colors.Add(FLinearColor::White);
			Colors.Add(FLinearColor::White);
		}
		for (int32 i = 0; i < Points.Num() - 1; ++i)
		{
			const int32 B = i * 2;
			Tris.Append({ B, B + 1, B + 2, B + 1, B + 3, B + 2 });
		}
	}
	Mesh->ClearAllMeshSections();
	TArray<FProcMeshTangent> Tangents;
	Mesh->CreateMeshSection_LinearColor(0, V, Tris, N, UV, Colors, Tangents, false);
	if (Mat) Mesh->SetMaterial(0, Mat);
}

void ASliceStage::WriteCircle(UProceduralMeshComponent* Mesh, const FVector& Center, float Radius, UMaterialInterface* Mat)
{
	TArray<FVector> Points;
	constexpr int32 Seg = 28;
	for (int32 i = 0; i <= Seg; ++i)
	{
		const float A = (float)i / Seg * 2.f * PI;
		Points.Add(Center + FVector(FMath::Cos(A), FMath::Sin(A) * 0.72f, FMath::Sin(A) * 0.25f) * Radius);
	}
	WriteRibbon(Mesh, Points, 0.22f, Mat);
}

void ASliceStage::Say(const FString& Title, const FString& Line, const FLinearColor& Color, float Time)
{
	Banner = Title;
	BannerSub = Line;
	BannerColor = Color;
	BannerT = Time;
}

void ASliceStage::Present()
{
	if (!bRunning)
	{
		Objective = TEXT("WAKE TOOK THE SHIP");
		Sub = TEXT("TAP TO FLY THE LANE AGAIN");
	}
	else if (Sealed >= 3)
	{
		Objective = TEXT("LANE SEALED");
		Sub = TEXT("THE INK HOLDS");
	}
	else if (Armed < 0)
	{
		Objective = TEXT("GRAZE THE WAKE");
		Sub = FString::Printf(TEXT("SKIM THE TEAL HALO    SEAL THE RAIDERS  %d/3"), Sealed);
	}
	else
	{
		Objective = FString::Printf(TEXT("TAP TO CAST %s"), GlyphName[FMath::Clamp(Armed, 0, 2)]);
		Sub = FString::Printf(TEXT("SEAL THE RAIDERS  %d/3"), Sealed);
	}
}

void ASliceStage::OnEndFrame()
{
	if (!bCapture || !bShotPending) return;
	bShotPending = false;
	CaptureShot(CaptureStep);
	++CaptureStep;
	if (CaptureStep >= FMath::RoundToInt(InkLane::Duration * InkLane::Fps))
	{
		FFileHelper::SaveStringToFile(TEXT("ok"), *(CaptureDir / TEXT("done.txt")));
		FPlatformMisc::RequestExit(false);
	}
}

void ASliceStage::CaptureShot(int32 Step)
{
	if (!GEngine || !GEngine->GameViewport || !GEngine->GameViewport->Viewport) return;
	TArray<FColor> Bitmap;
	FViewport* Viewport = GEngine->GameViewport->Viewport;
	if (!GetViewportScreenShot(Viewport, Bitmap)) return;
	const FIntPoint Size = Viewport->GetSizeXY();
	const FString Frame = FString::Printf(TEXT("%s/frame_%04d.png"), *CaptureDir, Step);
	FImageUtils::SaveImage(*Frame, FImageView(Bitmap.GetData(), Size.X, Size.Y));
	auto Bankers = [](float V)
	{
		const float F = FMath::FloorToFloat(V);
		const float Frac = V - F;
		if (Frac > 0.5f) return (int32)F + 1;
		if (Frac < 0.5f) return (int32)F;
		return ((int32)F % 2 == 0) ? (int32)F : (int32)F + 1;
	};
	const int32 Establish = Bankers(6.f * InkLane::Fps);
	const int32 Lance = Bankers(9.05f * InkLane::Fps);
	const int32 Nova = Bankers(22.15f * InkLane::Fps);
	if (Step == Establish) FImageUtils::SaveImage(*(CaptureDir / TEXT("shot_establish.png")), FImageView(Bitmap.GetData(), Size.X, Size.Y));
	if (Step == Lance) FImageUtils::SaveImage(*(CaptureDir / TEXT("shot_lance.png")), FImageView(Bitmap.GetData(), Size.X, Size.Y));
	if (Step == Nova) FImageUtils::SaveImage(*(CaptureDir / TEXT("shot_nova.png")), FImageView(Bitmap.GetData(), Size.X, Size.Y));
}
