# Mattertal terrain — s17 · 17o

The flight follows the Mattertal in Valais, Switzerland. The route runs from the glacier valley south of Zermatt, down past Täsch and Randa, and opens onto the Rhône at Visp.

That valley was chosen because it already matches the sortie. The south end is high and quiet, which is where the tanker waits. The middle narrows between steep walls, which is the defended belt. The bunker sits on the eastern slope as the floor drops toward St. Niklaus. The north end opens at Visp, which is the grid egress. The real valley runs south to north, the same way the jet flies. About 45 km of valley is laid along the existing 31 km of game track. The river stays on the centre line. Nothing about the tanker lock, the calm lesson, the bandit, or the grid was moved.

## Elevation

Source: Mapzen Terrain Tiles, Terrarium PNG, zoom 12.

Bucket: `s3://elevation-tiles-prod` (public HTTPS `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`).

Registry: https://registry.opendata.aws/terrain-tiles/

Terrarium height, in metres: `(red * 256 + green + blue / 256) - 32768`.

Switzerland falls in the European coverage of those tiles. Tilezen’s attribution for that coverage is: elevation produced using Copernicus data and information funded by the European Union (EU-DEM). Copernicus products may be reused when that attribution is kept. It is recorded here, in `CREDITS.txt`, and on the mission brief.

The samples are baked into `terrain/mattertal.js` as unsigned 16-bit heights in decimetres, 161 by 761, the same grid as the terrain mesh (40 m). The mesh writes those heights into its vertices. `H()` bilinear-samples the same array. The crash check raycasts the mesh and falls back to `H()` only if the ray misses, so the visible ground and the collision ground are the same surface. A two-metre channel is cut where the Vispa runs. There is no extra vertical scale.

Checked against the tiles: Zermatt village reads about 1,608 m. The south floor used by the tanker is about 2,400 m. Visp is about 650 m. The highest sample inside the 6.4 km corridor is about 3,856 m.

## Surface

Slope and height pick the material. Gentle ground below the snow line takes grass and forest litter (ambientCG Grass004 and Ground054, Poly Haven aerial_grass_rock, all CC0). Steep ground takes rock (ambientCG Rock030, Poly Haven rocky_terrain_02, CC0). Snow (ambientCG Snow006, CC0) starts near 2,680 m and is solid by 3,250 m, and it stays off the cliffs. The Vispa is a milky glacial colour on the flat floor. Trees are the existing instanced conifers, only on gentle slopes between about 1,050 m and 2,000 m, and there are fewer of them than in 17n. Boulders are fewer as well.

Clouds are the existing sprite cards, eight on a phone and twelve otherwise, sitting just above the local ground so the jet can pass near them. The sky is the same three.js physical sky and the same time of day. A light exponential fog adds haze. The frame cap, the adaptive scale, and battery saver are unchanged.

The bunker is on the east wall at the old target range, turned toward the valley, with a short road up from the floor. The blast raises a dust column as well as the existing fire.
