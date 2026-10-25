#pragma once

#include "CoreMinimal.h"

class UProceduralMeshComponent;

// Kenney OBJ (Y up, nose +Z) into a procedural mesh in Unreal space.
// TargetLength is meters along the mesh's Z extent.
void InkLaneLoadShip(UProceduralMeshComponent* Mesh, const FString& ObjPath, float TargetLengthMeters,
	UMaterialInterface* Hull, UMaterialInterface* Dark, UMaterialInterface* Engine);
