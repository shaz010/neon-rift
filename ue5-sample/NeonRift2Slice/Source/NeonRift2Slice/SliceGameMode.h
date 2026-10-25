#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SliceGameMode.generated.h"

UCLASS()
class NEONRIFT2SLICE_API ASliceGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	ASliceGameMode();
	virtual void StartPlay() override;
};
