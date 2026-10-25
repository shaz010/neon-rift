#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SliceHud.generated.h"

UCLASS()
class NEONRIFT2SLICE_API ASliceHud : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
};
