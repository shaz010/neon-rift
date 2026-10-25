#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SliceStage.generated.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;
class ASlicePawn;

UCLASS()
class NEONRIFT2SLICE_API ASliceStage : public AActor
{
	GENERATED_BODY()
public:
	ASliceStage();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	FString Objective;
	FString Sub;
	int32 Sealed = 0;
	int32 Armed = -1;
	float Shield = 1.f;
	FString Banner;
	FString BannerSub;
	float BannerT = 0.f;
	FLinearColor BannerColor = FLinearColor::White;

private:
	struct FWake
	{
		TArray<FVector> Points;
		UProceduralMeshComponent* Mesh = nullptr;
		void Push(const FVector& P);
		float Distance(const FVector& P) const;
	};
	struct FRaider
	{
		int32 Index = 0;
		bool bAlive = true;
		FVector Pos = FVector::ZeroVector;
		UProceduralMeshComponent* Body = nullptr;
		FWake Core;
		FWake Halo;
	};
	struct FLance
	{
		UStaticMeshComponent* Body = nullptr;
		FVector Pos = FVector::ZeroVector;
		FVector Dir = FVector::ForwardVector;
		int32 Target = 0;
		float Life = 0.f;
	};
	struct FSeal
	{
		int32 Target = 0;
		float Age = 0.f;
		UProceduralMeshComponent* Ring = nullptr;
	};
	struct FNova
	{
		int32 Target = 0;
		float Age = 0.f;
		bool bBurst = false;
		UStaticMeshComponent* Bloom = nullptr;
		UProceduralMeshComponent* Ring = nullptr;
	};
	struct FChunk
	{
		UStaticMeshComponent* Body = nullptr;
		FVector V = FVector::ZeroVector;
		FVector Spin = FVector::ZeroVector;
		float Life = 0.f;
	};

	void BuildWorld();
	void BeginRun();
	void TickSim(float Dt);
	void Present();
	void Wet(int32 Index, float Dist);
	void TryCast();
	void Payoff(int32 Index, int32 Glyph, const FLinearColor& Ink, int32 Bits);
	void Burst(const FVector& At, const FLinearColor& Ink, int32 Count);
	void WriteRibbon(UProceduralMeshComponent* Mesh, const TArray<FVector>& Points, float WidthMeters, UMaterialInterface* Mat);
	void WriteCircle(UProceduralMeshComponent* Mesh, const FVector& Center, float Radius, UMaterialInterface* Mat);
	UMaterialInstanceDynamic* LitMID(const FLinearColor& Base, const FLinearColor& Emissive, float Metallic, float Rough);
	UMaterialInstanceDynamic* GlowMID(const FLinearColor& Color);
	void Say(const FString& Title, const FString& Line, const FLinearColor& Color, float Time);
	void OnEndFrame();
	void CaptureShot(int32 Step);

	UPROPERTY()
	TObjectPtr<ASlicePawn> Pawn;
	UPROPERTY()
	UStaticMesh* CubeMesh = nullptr;
	UPROPERTY()
	UStaticMesh* SphereMesh = nullptr;
	UPROPERTY()
	UMaterialInterface* LitParent = nullptr;
	UPROPERTY()
	UMaterialInterface* GlowParent = nullptr;

	FWake PlayerInk;
	TArray<FRaider> Raiders;
	TArray<FLance> Lances;
	TArray<FSeal> Seals;
	TArray<FNova> Novas;
	TArray<FChunk> Chunks;
	UProceduralMeshComponent* Planet = nullptr;
	UProceduralMeshComponent* Clouds = nullptr;
	float Sim = 0.f;
	float HurtCd = 0.f;
	float Shake = 0.f;
	FVector2D Weave = FVector2D::ZeroVector;
	FVector PlayerPos = FVector::ZeroVector;
	int32 ArmedTarget = -1;
	float Power = 1.f;
	bool bRunning = true;
	bool bCapture = false;
	bool bGrazeA = false, bGrazeB = false, bGrazeC = false;
	bool bCastA = false, bCastB = false, bCastC = false;
	FString CaptureDir;
	int32 CaptureStep = 0;
	bool bShotPending = false;
	FDelegateHandle EndFrameHandle;
};
