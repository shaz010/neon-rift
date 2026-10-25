#include "SlicePawn.h"

#include "Camera/CameraComponent.h"
#include "ProceduralMeshComponent.h"

ASlicePawn::ASlicePawn()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
	AutoPossessPlayer = EAutoReceiveInput::Player0;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Ship = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Ship"));
	Ship->SetupAttachment(RootComponent);
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(RootComponent);
	Camera->bUsePawnControlRotation = false;
}

void ASlicePawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	PlayerInputComponent->BindAction(TEXT("Fire"), IE_Pressed, this, &ASlicePawn::OnFire);
	PlayerInputComponent->BindAction(TEXT("Reset"), IE_Pressed, this, &ASlicePawn::OnReset);
}

void ASlicePawn::OnFire() { bCast = true; }
void ASlicePawn::OnReset() { bReset = true; }
bool ASlicePawn::ConsumeCast() { const bool b = bCast; bCast = false; return b; }
bool ASlicePawn::ConsumeReset() { const bool b = bReset; bReset = false; return b; }

void ASlicePawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	ReadPointer();
}

void ASlicePawn::ReadPointer()
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC) return;
	int32 SX = 1, SY = 1;
	PC->GetViewportSize(SX, SY);
	SX = FMath::Max(SX, 1);
	SY = FMath::Max(SY, 1);

	float X = 0.f, Y = 0.f;
	bool bPressed = false;
	PC->GetInputTouchState(ETouchIndex::Touch1, X, Y, bPressed);
	if (bPressed)
	{
		if (!bTouching)
		{
			bTouching = true;
			TapTime = 0.f;
			TapStart = FVector2D(X, Y);
		}
		TapTime += GetWorld()->GetDeltaSeconds();
		const float NX = (X / SX - 0.5f) * 2.f;
		const float NY = (0.5f - Y / SY) * 2.f;
		Weave = FVector2D(FMath::Clamp(NX, -1.f, 1.f) * 18.f, FMath::Clamp(NY, -1.f, 1.f) * 10.f);
		return;
	}
	if (bTouching)
	{
		bTouching = false;
		if (TapTime < 0.22f && FVector2D::DistSquared(TapStart, FVector2D(X, Y)) < 28.f * 28.f)
		{
			bCast = true;
		}
	}

	float MX = 0.f, MY = 0.f;
	if (PC->GetMousePosition(MX, MY))
	{
		const float NX = (MX / SX - 0.5f) * 2.f;
		const float NY = (0.5f - MY / SY) * 2.f;
		Weave = FVector2D(FMath::Clamp(NX, -1.f, 1.f) * 18.f, FMath::Clamp(NY, -1.f, 1.f) * 10.f);
	}
}
