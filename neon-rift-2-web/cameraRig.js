/** Steady cameras. Orientation is rebuilt from a look direction and an up
 * vector, so the horizon never rolls, banks, or spins on its own. */

export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Local -Z looks along lookDir. Local +Y stays as close to `up` as possible. */
export function basisLooking(lookDir, up) {
  const look = normalize(lookDir);
  const back = [-look[0], -look[1], -look[2]];
  let x = cross(up, back);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-5) {
    const fallback = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    x = cross(fallback, back);
  }
  const xl = Math.hypot(x[0], x[1], x[2]);
  x = [x[0] / xl, x[1] / xl, x[2] / xl];
  const y = cross(back, x);
  const yl = Math.hypot(y[0], y[1], y[2]);
  return { x, y: [y[0] / yl, y[1] / yl, y[2] / yl], z: back };
}

export const COMMAND_LOOK = [0, -1, 0];
export const COMMAND_UP = [0, 0, -1];
export const COCKPIT_LOOK = normalize([0, -0.04, -1]);
export const COCKPIT_UP = [0, 1, 0];

export function commandBasis() {
  return basisLooking(COMMAND_LOOK, COMMAND_UP);
}

export function cockpitBasis() {
  return basisLooking(COCKPIT_LOOK, COCKPIT_UP);
}

/** Level cockpit for any heading. The horizon is world up. There is no bank. */
export function cockpitFromYaw(yaw) {
  const look = normalize([Math.sin(yaw), -0.045, -Math.cos(yaw)]);
  return basisLooking(look, COCKPIT_UP);
}

export function cockpitEye(player, yaw = 0) {
  const dist = 7.2;
  const heading = yaw || 0;
  return {
    x: player.x - Math.sin(heading) * dist,
    y: (player.y || 0) + 2.15,
    z: player.z + Math.cos(heading) * dist,
  };
}

/** High, straight-down frame. The ship sits in the lower third so incoming
 * craft stay on screen. Height depends on aspect; the orientation does not. */
export function commandFocus(player, aspect) {
  const needX = 20;
  const needZ = 30;
  const safeAspect = Math.max(0.42, Math.min(2.3, aspect || 0.5));
  const spanZ = Math.max(needZ, needX / safeAspect);
  const vfov = 42 * Math.PI / 180;
  const height = (spanZ * 0.5) / Math.tan(vfov * 0.5);
  const lookX = player.x * 0.35;
  const lookZ = player.z - spanZ * 0.18;
  return {
    vfov,
    height,
    spanZ,
    spanX: spanZ * safeAspect,
    position: { x: lookX, y: height, z: lookZ },
  };
}


/** Frozen outside view: behind and above the muzzle, looking along the shot.
 * The caller keeps this basis for the whole cut. Dolly is translation only. */
export function shotPose(from, to) {
  const dx = to.x - from.x;
  const dy = (to.y || 0.4) - (from.y || 0.4);
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / len;
  const fy = dy / len;
  const fz = dz / len;
  const eye = {
    x: from.x - fx * 12.5 + fz * 1.6,
    y: (from.y || 0.4) + 5.8,
    z: from.z - fz * 12.5 - fx * 1.6,
  };
  const reach = Math.min(18, Math.max(8, len * 0.62));
  const lookAt = {
    x: from.x + fx * reach,
    y: (from.y || 0.4) + fy * reach * 0.25 + 0.3,
    z: from.z + fz * reach,
  };
  const lookDir = normalize([
    lookAt.x - eye.x,
    lookAt.y - eye.y,
    lookAt.z - eye.z,
  ]);
  return { eye, lookDir, basis: basisLooking(lookDir, [0, 1, 0]) };
}
