#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SlicePawn.generated.h"

class UCameraComponent;
class UProceduralMeshComponent;

UCLASS()
class NEONRIFT2SLICE_API ASlicePawn : public APawn
{
	GENERATED_BODY()
public:
	ASlicePawn();
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	bool ConsumeCast();
	bool ConsumeReset();
	FVector2D WeaveMeters() const { return Weave; }
	UCameraComponent* Camera = nullptr;
	UProceduralMeshComponent* Ship = nullptr;

private:
	void OnFire();
	void OnReset();
	void ReadPointer();
	FVector2D Weave = FVector2D::ZeroVector;
	bool bCast = false;
	bool bReset = false;
	bool bTouching = false;
	float TapTime = 0.f;
	FVector2D TapStart = FVector2D::ZeroVector;
};
