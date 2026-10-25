#include "SliceHud.h"

#include "SliceStage.h"
#include "SliceTypes.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Kismet/GameplayStatics.h"

void ASliceHud::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	ASliceStage* Stage = Cast<ASliceStage>(UGameplayStatics::GetActorOfClass(GetWorld(), ASliceStage::StaticClass()));
	if (!Stage) return;

	UFont* Big = GEngine ? GEngine->GetLargeFont() : nullptr;
	UFont* Small = GEngine ? GEngine->GetMediumFont() : nullptr;
	const float W = Canvas->SizeX;
	const float H = Canvas->SizeY;
	const FLinearColor Ink = InkLane::Ink();
	const FLinearColor Sky = InkLane::Sky();

	DrawText(TEXT("NEON RIFT 2"), Ink, 48.f, 36.f, Big, 1.15f);
	const FString Shield = FString::Printf(TEXT("INK  %d"), FMath::RoundToInt(Stage->Shield * 100.f));
	float TW = 0.f, TH = 0.f;
	GetTextSize(Shield, TW, TH, Big, 0.9f);
	DrawText(Shield, Sky, W - TW - 48.f, 40.f, Big, 0.9f);

	const FString& Main = Stage->Objective;
	GetTextSize(Main, TW, TH, Big, 1.35f);
	DrawRect(FLinearColor(0.02f, 0.04f, 0.07f, 0.45f), (W - TW) * 0.5f - 28.f, H - 210.f, TW + 56.f, 78.f);
	DrawText(Main, Ink, (W - TW) * 0.5f, H - 198.f, Big, 1.35f);
	GetTextSize(Stage->Sub, TW, TH, Small, 1.f);
	DrawText(Stage->Sub, Sky, (W - TW) * 0.5f, H - 130.f, Small, 1.f);

	const TCHAR* Names[3] = { TEXT("LANCE"), TEXT("SEAL"), TEXT("NOVA") };
	const FLinearColor Tints[3] = { InkLane::Lavender(), InkLane::Teal(), InkLane::Amber() };
	for (int32 i = 0; i < 3; ++i)
	{
		const float X = W * 0.5f + (i - 1) * 160.f;
		const bool bArmed = Stage->Armed == i;
		const bool bDone = Stage->Sealed > i;
		FLinearColor C = Tints[i];
		C.A = bArmed ? 1.f : bDone ? 0.85f : 0.28f;
		DrawRect(C, X - 18.f, H - 92.f, 36.f, 12.f);
		float NW = 0.f, NH = 0.f;
		GetTextSize(Names[i], NW, NH, Small, 0.8f);
		DrawText(Names[i], C, X - NW * 0.5f, H - 74.f, Small, 0.8f);
	}

	if (Stage->BannerT > 0.f && !Stage->Banner.IsEmpty())
	{
		GetTextSize(Stage->Banner, TW, TH, Big, 1.8f);
		DrawText(Stage->Banner, Stage->BannerColor, (W - TW) * 0.5f, H * 0.42f, Big, 1.8f);
		GetTextSize(Stage->BannerSub, TW, TH, Small, 1.f);
		DrawText(Stage->BannerSub, Ink, (W - TW) * 0.5f, H * 0.42f + 64.f, Small, 1.f);
	}

	const FString Cast = Stage->Sealed >= 3 ? TEXT("SEALED") : Stage->Armed < 0 ? TEXT("GRAZE") : FString::Printf(TEXT("CAST %s"), Names[FMath::Clamp(Stage->Armed, 0, 2)]);
	GetTextSize(Cast, TW, TH, Big, 1.f);
	DrawRect(FLinearColor(0.05f, 0.08f, 0.1f, 0.72f), W - TW - 96.f, H - 150.f, TW + 48.f, 72.f);
	DrawText(Cast, Ink, W - TW - 72.f, H - 132.f, Big, 1.f);
}
