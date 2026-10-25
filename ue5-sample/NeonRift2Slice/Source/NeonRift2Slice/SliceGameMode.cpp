#include "SliceGameMode.h"

#include "SliceHud.h"
#include "SlicePawn.h"
#include "SliceStage.h"

ASliceGameMode::ASliceGameMode()
{
	DefaultPawnClass = ASlicePawn::StaticClass();
	HUDClass = ASliceHud::StaticClass();
}

void ASliceGameMode::StartPlay()
{
	Super::StartPlay();
	GetWorld()->SpawnActor<ASliceStage>(ASliceStage::StaticClass(), FTransform::Identity);
}
