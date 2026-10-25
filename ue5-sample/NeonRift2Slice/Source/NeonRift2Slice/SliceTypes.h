#pragma once

#include "CoreMinimal.h"

// Same lane as the Unity slice. Sim space is meters, Y up, Z forward.
// Unreal receives centimeters, X forward, Y right, Z up.

namespace InkLane
{
	constexpr float Duration = 42.f;
	constexpr float Fps = 30.f;
	constexpr float Cruise = 50.f;
	constexpr float PlanetRadius = 3900.f;
	constexpr float CoreRadius = 1.05f;
	constexpr float HaloRadius = 3.6f;
	constexpr float GrazeOffset = 2.15f;
	constexpr float GrazeA = 8.f;
	constexpr float GrazeB = 13.5f;
	constexpr float GrazeC = 20.5f;
	constexpr float CastA = 8.8f;
	constexpr float CastB = 14.25f;
	constexpr float CastC = 21.2f;

	inline FVector PlanetCenter() { return FVector(1600.f, -420.f, 6400.f); }
	inline FVector SunDir() { return FVector(-0.2208f, 0.5820f, -0.7827f); }

	inline FVector ToUE(const FVector& Meters)
	{
		return FVector(Meters.Z * 100.f, Meters.X * 100.f, Meters.Y * 100.f);
	}

	inline FVector ToUEDir(const FVector& Dir)
	{
		return FVector(Dir.Z, Dir.X, Dir.Y);
	}

	inline FVector Lane(float T)
	{
		return FVector(FMath::Sin(T * 0.18f) * 8.f, 22.f + FMath::Sin(T * 0.13f) * 3.5f, T * Cruise);
	}

	inline FVector Hold(int32 Index, float T)
	{
		const float Bob = FMath::Sin(T * 1.15f + Index * 1.7f) * 1.05f;
		if (Index == 0) return FVector(14.f, 2.f + Bob, 22.f);
		if (Index == 1) return FVector(-12.f, 3.4f + Bob, 24.f);
		return FVector(3.f, 6.f + Bob, 18.f);
	}

	inline float Arrive(int32 Index, float T)
	{
		const float A = Index == 0 ? 2.2f : Index == 1 ? 3.8f : 5.f;
		const float B = Index == 0 ? 6.f : Index == 1 ? 10.2f : 16.2f;
		return FMath::SmoothStep(0.f, 1.f, FMath::GetRangePct(A, B, T));
	}

	inline FVector RaiderPos(int32 Index, float T)
	{
		const FVector HoldNow = Hold(Index, T);
		const FVector Far(HoldNow.X * 1.8f, HoldNow.Y + 12.f, HoldNow.Z + 46.f);
		return Lane(T) + FMath::Lerp(Far, HoldNow, Arrive(Index, T));
	}

	inline FVector2D ScriptedWeave(float Now);

	inline FLinearColor Teal() { return FLinearColor(FColor::FromHex(TEXT("5EF2D6"))); }
	inline FLinearColor Lavender() { return FLinearColor(FColor::FromHex(TEXT("C9A0FF"))); }
	inline FLinearColor Amber() { return FLinearColor(FColor::FromHex(TEXT("FFD27A"))); }
	inline FLinearColor Coral() { return FLinearColor(FColor::FromHex(TEXT("FF9E8A"))); }
	inline FLinearColor Ink() { return FLinearColor(FColor::FromHex(TEXT("E6F4FF"))); }
	inline FLinearColor Sky() { return FLinearColor(FColor::FromHex(TEXT("8EC5FF"))); }
}

// Defined out of line in the header so both the pawn and the stage share one weave.
inline FVector2D InkLane::ScriptedWeave(float Now)
{
	auto Skim = [](FVector2D Idle, float T, float When, int32 Index) -> FVector2D
	{
		const float Begin = When - 1.65f;
		const float End = When + 1.35f;
		if (T < Begin || T > End) return Idle;
		const FVector HoldAt = Hold(Index, When);
		const FVector2D Target(HoldAt.X, HoldAt.Y + GrazeOffset);
		if (T < When + 0.1f)
		{
			const float K = FMath::SmoothStep(0.f, 1.f, FMath::GetRangePct(Begin, When - 0.04f, T));
			return FMath::Lerp(Idle, Target, K);
		}
		const float Out = FMath::SmoothStep(0.f, 1.f, FMath::GetRangePct(When + 0.1f, End, T));
		return FMath::Lerp(Target, Idle, Out);
	};
	FVector2D Idle(FMath::Sin(Now * 0.62f) * 3.1f, FMath::Sin(Now * 0.44f) * 1.3f);
	Idle = Skim(Idle, Now, GrazeA, 0);
	Idle = Skim(Idle, Now, GrazeB, 1);
	Idle = Skim(Idle, Now, GrazeC, 2);
	return Idle;
}
