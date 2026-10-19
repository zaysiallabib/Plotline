/**
 * Look: tone mapping, post-processing (GTAO), interior lights and the exterior
 * context (sky, ground, floor slab, shadow catcher). Owned by PlotlineScene,
 * which calls setUnit / setHour / setSize / render / dispose.
 *
 * Tone: Khronos PBR Neutral keeps albedo ≈ displayed colour below ~0.76, so
 * white plaster stays white and oak keeps its hue; only highlights (sun
 * patches, fixtures) compress. ACES greyed and hue-shifted the whites, AgX
 * desaturated wood and marble.
 *
 * VR renders directly (no composer): renderer.toneMapping then applies on the
 * XR framebuffer, so the look matches minus AO.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'
import { isCeilingLight, placementSize } from '../furnish/kit'
import { setLeafGlow } from '../furnish/procedural'
import { buildContactShadows, buildStreet, haze, hazed, outdoorFill, setHaze } from './context'
import { dayMix, isCovered, openToSky } from './daylight'
import { carriesRoof, roomCeiling, storeyTop, wallLift } from './details'
import { EXTERIOR_PLASTER, materialFor } from './materials'
import { meterUVs, PANES, setGlassSky } from './openings'

/**
 * high: GTAO + 4× MSAA buffer, up to 2× pixels, 2048 shadow map. low: no AO, 1024 shadow. lite (weak machines,
 * PlotlineScene): also 1× pixels, no MSAA, anisotropy 1, textures at half size, no scanned plants, no idle frames.
 */
export type Quality = 'high' | 'low' | 'lite'

/** Lite draws a frame only when it can differ from the last one: the camera moved, input or a load within the wake window, VR. */
export const needsFrame = (s: { tier: Quality; xr: boolean; moved: boolean; now: number; wakeUntil: number }): boolean =>
  s.tier !== 'lite' || s.xr || s.moved || s.now < s.wakeUntil

/** Frame times (ms) taken while moving are slow: the median of at least 45 is worse than 30 fps (35 ms: rAF steps by 16.7 ms). */
export function slowFrames(ms: number[]): boolean {
  if (ms.length < 45) return false
  const s = [...ms].sort((a, b) => a - b)
  return s[s.length >> 1] > 35
}

const STOREY_M = 3.2
/** the site's neighbours are fetched 250 m round the plot: a block that far toward a low sun can still shade the flat */
export const SITE_REACH_M = 300
/** the sun's shadow bias in metres (−0.0005 of a flat's own ≈ 40 m depth range, as tuned before the site) */
const SHADOW_BIAS_M = 0.02
const SLAB_M = 0.15
const ROOF_LIFT = 0.04
// Measured on the living-room view (sRGB of shaded walls/ceiling): ENV 0.7/HEMI 0.6 → walls 160, ceiling 170;
// ENV 1.4/HEMI 1.2 → walls 221–231 — too close to white: a sun patch had no headroom left and the hour didn't show.
// 0.8/0.6 read grey (art director, wave 5); the midpoint 1.1/0.9 aims for walls ≈ 195–205.
const HEMI = 0.9
const ENV = 1.1
const HEMI_SKY = new THREE.Color('#e6e9ee') // barely cool: #dfe7f5 turned the warm-white walls grey
/** near-neutral: the old #d8cab6 ground tinted every ceiling peach */
const HEMI_GROUND = new THREE.Color('#cfcbc4')
/** sky light + sky dome at sunrise / sunset (low sun) */
const GOLDEN = new THREE.Color('#ffd2a8')
/** the flat's lamps: 3000 K LEDs as a camera white-balanced for the room sees them (the raw blackbody #ffb46b turned every room orange) */
const WARM = new THREE.Color('#ffd6a5')
/**
 * The lamps' light bounced off the room (scene lux, hemisphere): up from the lit floor onto the ceiling, down from the
 * ceiling. A 100 lm/m² room over ≈ 4.5 m² of surface per m² of floor, half reflected: ≈ 0.2 lux mean. Without it the
 * downward lamps left every ceiling black.
 */
const BOUNCE_UP = 0.28
const BOUNCE_DOWN = 0.08
/**
 * Scene units: 1 scene lux ≈ 100 real lux at the lamps' calibration (the day's indirect fill, ENV + HEMI ≈ 2, reads as a
 * ≈ 200 lux room; the sun patch is compressed, as a photo would). A room's lamp: 150 lm per m² of floor, 900–4500 lm
 * (a 10–45 W LED ceiling light, or a fan's kit and a tube light), Lambertian under a flush diffuser: peak candela Φ / π.
 */
export const lampCandela = (areaSqm: number): number => Math.min(4500, Math.max(900, 150 * areaSqm)) / Math.PI / 100
/** + sun + hemisphere: forward shading pays for every light on every lit fragment — at intensity 0 too (no recompile on / off) */
const MAX_ROOM_LIGHTS = 12
/** lamps casting shadows at once (the nearest to the camera; the count never changes: no recompile) */
const CASTERS: Record<Quality, number> = { high: 3, low: 2, lite: 1 }
/** the fixtures' diffusers, pendant globes and fan light kits: × their own emissive while the lamps are on, 0 when off */
const ON_GLOW = 4
/** a pane at night with the lamps on: how strongly it mirrors the room (the interior probe), a faint reflection on dark glass */
const PANE_ROOM = 0.06
/** the camera at night: the room exposed as a photo of a lit flat is, 2 stops over the day's */
export const NIGHT_EXPOSURE = 4
/** the sky's fill as SEEN (after exposure) by the sun's altitude, ° → fraction of the day's: a clear sky's diffuse light */
const SEEN: [number, number][] = [
  [10, 1],
  [5, 0.8],
  [0, 0.5],
  [-3, 0.2],
  [-6, 0.06],
  [-10, 0.025],
  [-18, 0.02], // a city's glow, never black
]
/** the dome's twilight / night gradient as seen (sRGB): [alt°, zenith, horizon, glow toward the sun's bearing] */
const TWILIGHT: [number, string, string, string][] = [
  [0, '#6f8fbf', '#e9b48c', '#ffa060'],
  [-3, '#34528a', '#b88a80', '#d27a48'],
  [-6, '#16264a', '#4a4660', '#6a4434'],
  [-10, '#080d1c', '#1f1e26', '#201812'],
  [-18, '#05070e', '#1e1b1c', '#000000'], // the city's glow low on the horizon
]
/** a table sorted by falling altitude: `f` mixes rows a and b (t 0 → a, the higher one) */
function byAlt<T>(rows: [number, ...unknown[]][], alt: number, f: (a: number, b: number, t: number) => T): T {
  const i = rows.findIndex((r) => alt >= r[0])
  if (i === 0) return f(0, 0, 0)
  if (i < 0) return f(rows.length - 1, rows.length - 1, 0)
  return f(i - 1, i, (rows[i - 1][0] - alt) / (rows[i - 1][0] - rows[i][0]))
}

export interface SkyLight {
  /** renderer.toneMappingExposure: 1 by day; the camera opens up as the sky goes, to NIGHT_EXPOSURE */
  exposure: number
  /** the sky's fill (environment + hemisphere) as a fraction of the day's, before exposure */
  fill: number
  /** 1 while the sun is low (≲ 14°) → 0 above ~30°: sky light and the dome go golden */
  golden: number
  /** 0 → 1 as the sun sets (2° up → 2° down): the dome turns from the photo sky to the twilight / night gradient */
  night: number
}

/** The sky's light by the sun's altitude in degrees (below 0: under the horizon). Noon down to 10° is the day look unchanged. */
export function skyLight(altDeg: number): SkyLight {
  const exposure = 1 + (NIGHT_EXPOSURE - 1) * THREE.MathUtils.smoothstep(-altDeg, -5, 6)
  const seen = byAlt(SEEN, altDeg, (a, b, t) => Math.exp((1 - t) * Math.log(SEEN[a][1]) + t * Math.log(SEEN[b][1])))
  const s = Math.sin(THREE.MathUtils.degToRad(Math.max(altDeg, 1)))
  return { exposure, fill: seen / exposure, golden: 1 - THREE.MathUtils.smoothstep(s, 0.24, 0.5), night: THREE.MathUtils.smoothstep(-altDeg, -2, 2) }
}

/** The dome's twilight gradient at this altitude, linear RGB as seen (Look divides by the exposure). */
export function twilight(altDeg: number): { zenith: THREE.Color; horizon: THREE.Color; glow: THREE.Color } {
  return byAlt(TWILIGHT, altDeg, (a, b, t) => {
    const mix = (k: 1 | 2 | 3) => new THREE.Color(TWILIGHT[a][k]).lerp(new THREE.Color(TWILIGHT[b][k]), t)
    return { zenith: mix(1), horizon: mix(2), glow: mix(3) }
  })
}

/** Lights: 'auto' = on once the sun is under 5° (dusk inside a flat), off by day; or the person's pick. */
export type LightsMode = 'auto' | 'on' | 'off'
export const lightsOn = (mode: LightsMode, altDeg: number): boolean => (mode === 'auto' ? altDeg < 5 : mode === 'on')

/**
 * The lamps that cast shadows: those in the camera's room first, then the nearest to the camera; `k` of them (fewer only
 * if there are fewer lamps). Indices into `lamps`.
 */
export function pickCasters(lamps: { x: number; z: number; here: boolean }[], cam: { x: number; z: number }, k: number): number[] {
  return lamps
    .map((l, i) => ({ i, rank: (l.here ? 0 : 1e6) + Math.hypot(l.x - cam.x, l.z - cam.z) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, k)
    .map((r) => r.i)
}
/** Covered zones (coverLights): a batten every GRID m, the real downlights among them, their candela. */
const GRID = 3.6
const COVER_LIGHTS = 4
const COVER_CD = 18
/** a 4000 K LED batten's diffuser */
const BATTEN = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f3f5ff', emissiveIntensity: 3 })
/**
 * Debug switches, one cause each, for the founder's "small blips whenever I move my view" (2026-10-04) — add to any viewer
 * URL: `?ao=0` no ambient occlusion pass, `?shadows=0` no sun shadow map. Not shown anywhere in the UI.
 */
const SWITCHES = new URLSearchParams(globalThis.location?.search ?? '')
export const switchedOff = (name: 'ao' | 'shadows'): boolean => SWITCHES.get(name) === '0'

export class Look {
  private readonly composer: EffectComposer | null = null
  private readonly ao: GTAOPass | null = null
  private readonly hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI)
  /** equirect sky on a camera-centred dome instead of scene.background, so the hour can tint it */
  private readonly sky = new THREE.Mesh(
    new THREE.SphereGeometry(250, 48, 24).scale(1, 1, -1), // mirrored: u matches three's equirectUv, faces point inward
    new THREE.MeshBasicMaterial({ depthWrite: false }),
  )
  private readonly unitGroup = new THREE.Group()
  /** the slab above: exists only while the camera is under the ceiling (walk / VR) */
  private readonly indoor = new THREE.Group()
  private readonly catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color: '#2a2018', opacity: 0.35, depthWrite: false }),
  )
  private readonly ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
    hazed(new THREE.MeshStandardMaterial({ color: '#86817a', roughness: 0.95 })), // paving; a tiled texture reads as carpet from 20 m up
  )
  /** per unit (context.ts): contact shadows under the furniture; the street (in `indoor`: none around the dollhouse) */
  private contact: THREE.Mesh | null = null
  private street: THREE.Group | null = null
  /** `id`: the fixture placement it hangs at; `room`: its room's polygon (pickCasters: the camera's room first) */
  private lights: { light: THREE.SpotLight; base: number; id: string; room: Pt[] }[] = []
  /** the flat's lamps on (lightsOn) and the sky's light, as last set */
  private on = false
  /** the Building view: the camera is outside the tower, whose shells take no bounce from this flat's lamps */
  outside = false
  private alt = 45
  private casters: number
  /** where the shadow-casting lamps were last picked from */
  private readonly pickedAt = new THREE.Vector3(Infinity, 0, 0)
  /** the dome's twilight uniforms (setAltitude) */
  private readonly dome = { night: { value: 0 }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(1, 0, 0) } }
  /** materials that glow while the lamps are on (fixtureGlow, the pendant's globe, the fan's light kit): their own emissive intensity */
  private readonly glows = new Map<THREE.MeshStandardMaterial, number>()
  /** what the panes mirror (PlotlineScene.loadEnvironment): the sky's PMREM by day, the interior's at night */
  readonly paneEnvs: { sky?: THREE.Texture; room?: THREE.Texture } = {}
  private readonly fitBox = new THREE.Box3()
  private topY = 3
  /** how far toward the sun the shadow box reaches past the flat: a site's blocks shade it (SITE_REACH_M), else 1 m */
  private reach = 1
  private readonly v = new THREE.Vector3()
  private readonly c = new THREE.Color()
  /** casterKey of the last shadow map drawn; NaN: draw it on the next frame (a context loss emptied it) */
  private shadowKey = NaN
  private readonly onRestored = (): void => void (this.shadowKey = NaN)

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.DirectionalLight,
    quality: Quality,
  ) {
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.shadowMap.enabled = !switchedOff('shadows')
    this.casters = CASTERS[quality]
    sun.shadow.autoUpdate = false // render(): drawn again when what it sees changed (casterKey)
    renderer.shadowMap.autoUpdate = false // drawn when something it sees changes: render() / casterKey
    renderer.domElement.addEventListener('webglcontextrestored', this.onRestored)
    renderer.shadowMap.type = THREE.PCFShadowMap
    sun.castShadow = true
    sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    sun.shadow.radius = 2
    scene.environmentIntensity = ENV

    this.ground.receiveShadow = true
    this.catcher.receiveShadow = true
    this.sky.frustumCulled = false
    // under the horizon the dome shows the HDRI's mirrored sky: a dark band between eye level and the ground's far
    // edge (2–6° down from a flat). It fades into the haze the ground ends in.
    // after sunset the photo sky gives way to a twilight / night gradient (setAltitude): zenith to horizon, a glow toward
    // where the sun went down
    this.sky.material.onBeforeCompile = (s) => {
      s.uniforms.hazeColor = haze
      const d = this.dome
      Object.assign(s.uniforms, { skyNight: d.night, skyZen: d.zenith, skyHor: d.horizon, skyGlow: d.glow, skySun: d.sunDir })
      s.vertexShader = `varying vec3 vSkyDir;\n${s.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyDir = normalize(position);')
      s.fragmentShader = `uniform vec3 hazeColor;\nuniform float skyNight;\nuniform vec3 skyZen;\nuniform vec3 skyHor;\nuniform vec3 skyGlow;\nuniform vec3 skySun;\nvarying vec3 vSkyDir;\n${s.fragmentShader}`.replace(
        '#include <tonemapping_fragment>',
        `float up = max(vSkyDir.y, 0.0);
        vec2 flat2 = normalize(vSkyDir.xz + vec2(1e-5));
        vec3 dusk = mix(skyHor, skyZen, sqrt(up)) + skyGlow * pow(max(dot(flat2, skySun.xz), 0.0), 3.0) * exp(-8.0 * up);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, dusk, skyNight);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, 1.0 - smoothstep(-0.03, 0.03, vSkyDir.y));
        #include <tonemapping_fragment>`,
      )
    }
    this.sky.renderOrder = -1
    scene.add(this.hemi, this.sky, this.ground, this.catcher, this.unitGroup)

    if (quality === 'high') {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) })
      this.composer = new EffectComposer(renderer, rt)
      this.composer.addPass(new RenderPass(scene, camera))
      const ao = (this.ao = new GTAOPass(scene, camera, 1, 1))
      // a horizon sample off the screen read the edge pixel's depth (clamp): a false-occlusion band along the screen edge
      // that crawled as the view turned (measured 2026-10-04: all the AO flicker of a pan). Off-screen counts as open.
      ao.gtaoMaterial.fragmentShader = ao.gtaoMaterial.fragmentShader.replace(
        'float sampleSceneDepth = getDepth(sampleUv);',
        'float sampleSceneDepth = any(notEqual(sampleUv, clamp(sampleUv, 0.0, 1.0))) ? 1.0 : getDepth(sampleUv);',
      )
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 0.5, scale: 1, samples: 16 })
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
      ao.blendIntensity = 0.9
      ao.enabled = !switchedOff('ao')
      this.composer.addPass(ao)
      this.composer.addPass(new OutputPass())
    }
  }

  /** The street plane, and this flat's own slab / lights / street: hidden while the Building view shows a level below them. */
  /** The Building view's street (building.ts streetY: under a traced ground floor's lowest floor) for the ground plane; null: the unit's own again. */
  setStreetY(y: number | null): void {
    this.ground.position.y = y ?? this.groundY
    if (this.street?.userData.site) this.street.visible = y === null // the Building view draws the site round the tower itself
  }
  private groundY = 0

  showGround(plane: boolean, flat = plane): void {
    this.ground.visible = plane
    this.unitGroup.visible = flat
  }

  /** Equirect sky texture for the dome; lighting stays on the interior HDRI. */
  setSky(tex: THREE.Texture): void {
    this.sky.material.map?.dispose() // context restore reloads it
    this.sky.material.map = tex
    this.sky.material.needsUpdate = true
  }

  /** Per-unit: slab + roof, catcher, ground level, a light at each ceiling fixture placement. */
  setUnit(unit: Unit, rooms: Room[], cover: Pt[][] = []): void {
    this.unitGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.())
    this.disposeContext()
    this.unitGroup.clear()
    this.indoor.clear()
    this.lights = []

    // floor levels (session 19): a room's floor at its label's level (a ramp: its plane), its ceiling at its walls' top
    const level = (r: Room, x: number, y: number) => core.roomLevelAt(r, unit, x, y)
    const ceilingOf = (r: Room) => roomCeiling(r, unit, rooms) // as buildRoom (a covered storey: PlotlineScene lifts it to the slab)
    this.topY = storeyTop(unit, rooms)
    const lowest = Math.min(0, ...rooms.flatMap((r) => core.roomPolygon(r, unit).map((p) => level(r, p.x, p.y))))

    // slab: room undersides (centreline polygons, each under its floor) + a box under every wall to reach the outer face
    const roomParts = rooms.map((r) =>
      new THREE.ShapeGeometry(new THREE.Shape(core.roomPolygon(r, unit).map((p) => new THREE.Vector2(p.x, p.y))))
        .rotateX(Math.PI / 2) // plan (x, y) → world (x, 0, z=y), facing down
        .translate(0, -SLAB_M, 0),
    )
    const underFloors = roomParts.map((g, i) => {
      const c = g.clone()
      const p = c.attributes.position
      for (let k = 0; k < p.count; k++) p.setY(k, level(rooms[i], p.getX(k), p.getZ(k)) - SLAB_M)
      return c
    })
    const sidesOf = (w: Unit['walls'][number]) => {
      const f = core.wallFrame(w, unit.vertices)
      const off = w.thicknessM / 2 + 0.05
      const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
      return [1, -1].map((s) => core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, unit))
    }
    /** a box under / over wall w from u0 to u1 along it (default: the whole wall), reaching past a wall END by half its thickness */
    const box = (w: Unit['walls'][number], y: number, u0 = 0, u1?: number) => {
      const f = core.wallFrame(w, unit.vertices)
      const [a, b] = [u0 - (u0 <= 1e-9 ? w.thicknessM / 2 : 0), (u1 ?? f.lengthM) + ((u1 ?? f.lengthM) >= f.lengthM - 1e-9 ? w.thicknessM / 2 : 0)]
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.dir.y, 0, f.dir.x))
      m.setPosition(f.origin.x + (f.dir.x * (a + b)) / 2, y - (SLAB_M + 0.001) / 2, f.origin.y + (f.dir.y * (a + b)) / 2)
      return meterUVs(new THREE.BoxGeometry(b - a, SLAB_M - 0.001, w.thicknessM).applyMatrix4(m)) // the plaster scan, not stretched 0..1 per face
    }
    /** the stretches of wall w under the cover (0.5 m steps by their middles) */
    const underCover = (w: Unit['walls'][number]): [number, number][] => {
      const f = core.wallFrame(w, unit.vertices)
      const n = Math.max(1, Math.ceil(f.lengthM / 0.5))
      const runs: [number, number][] = []
      for (let i = 0; i < n; i++) {
        const [u0, u1] = [(i * f.lengthM) / n, ((i + 1) * f.lengthM) / n]
        const p = { x: f.origin.x + (f.dir.x * (u0 + u1)) / 2, y: f.origin.y + (f.dir.y * (u0 + u1)) / 2 }
        if (!cover.some((c) => core.pointInPolygon(p, c))) continue
        const last = runs.at(-1)
        if (last && Math.abs(last[1] - u0) < 1e-9) last[1] = u1
        else runs.push([u0, u1])
      }
      return runs
    }
    const wallParts = unit.walls.map((w) => box(w, 0))
    // under the floors: each wall's box under its lower side's floor; none under a flush line (the floors meet on it, and a
    // box there poked up through a ramp beside it)
    const footParts = unit.walls.flatMap((w) => (w.heightM > 0 ? [box(w, Math.min(...wallLift(w, unit, rooms).foot))] : []))
    // the roof closes no wall that stands only among open zones (a kerb, a boundary wall, a screen in a lawn): a beam at the
    // storey's top over it would hang in the sky and stripe the lawn with its shadow
    const open = (r: Room | null) => !r || r.kind === 'shaft' || (core.isOutdoor(r.kind) && !isCovered(r, cover)) // a void in a roof deck too
    // — and a wall among zones only (a boundary wall, a ramp's side) closes the roof only where the cover is over it: a
    // drive half under the tower kept a beam along its whole wall, out into the sky
    const roofWalls = unit.walls.flatMap((w, i) => {
      const s = sidesOf(w)
      if (!(w.heightM > 0) || !carriesRoof(w, s, unit, rooms, this.topY) || (s.some((r) => r && core.isOutdoor(r.kind)) && s.every(open))) return []
      return s.some((r) => r) && s.every((r) => !r || core.isOutdoor(r.kind)) ? underCover(w).map(([u0, u1]) => box(w, 0, u0, u1)) : [wallParts[i]]
    })
    const slabGeo = mergeGeometries([...underFloors, ...footParts])
    // the roof's room undersides (single planes the shadow map stores) sit ROOF_LIFT higher than its wall boxes: 5 mm over
    // the wall tops, the shadow biases reached past them and lit the top few mm of every wall facing the sun — a thin sun
    // streak at the ceiling (founder, 2026-10-04). The boxes still close the wall tops, so no low sun gets in between.
    // an outdoor zone is open to the sky unless the slab above (`cover`, the floor above's footprint) hangs over it: that
    // slab is in the roof too, and from below it is the zone's soffit
    const over = cover.map((poly) => new THREE.ShapeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)))).rotateX(Math.PI / 2).translate(0, -SLAB_M, 0))
    // (a room under the cover: the cover's own plane is its roof — two coplanar planes fought in stripes)
    const lifted = [...roomParts.filter((_, i) => !openToSky(rooms[i], cover) && !cover.some((c) => core.pointInPolygon(rooms[i].centroid, c))), ...over].map((g) => g.clone().translate(0, ROOF_LIFT, 0))
    const roofGeo = mergeGeometries([...lifted, ...roofWalls])
    ;[...roomParts, ...underFloors, ...wallParts, ...footParts, ...lifted, ...over, ...roofWalls].forEach((g) => g.dispose())
    const slab = new THREE.Mesh(slabGeo, materialFor(EXTERIOR_PLASTER))
    slab.castShadow = slab.receiveShadow = true
    // the storey above: ceilings don't cast, so without it the sun pours in through every ceiling
    const roof = new THREE.Mesh(roofGeo, slab.material)
    roof.position.y = this.topY + SLAB_M + 0.005 // underside 5 mm above the ceiling plane: no z-fight
    roof.castShadow = true
    this.indoor.add(roof)

    const b = core.unitBounds(unit)
    this.catcher.position.set((b.minX + b.maxX) / 2, lowest - SLAB_M - 0.01, (b.minY + b.maxY) / 2)
    // a flat with no floor typed (a Studio draft) stands where the Building view puts one (building.ts: floor 2), not on
    // the street: Dhaka flats start above the ground-floor parking. A ground level's sunken zones stay above the street plane.
    // (a basement's street is above it, whatever its ramps go down to: never lowered to them)
    const street = -(unit.floor ?? 2) * STOREY_M - 0.2
    this.ground.position.y = this.groundY = street > 0 ? street : Math.min(street, lowest - 0.05)
    this.fitBox.set(new THREE.Vector3(b.minX - 0.5, lowest - SLAB_M - 0.05, b.minY - 0.5), new THREE.Vector3(b.maxX + 0.5, this.topY + SLAB_M + 0.05, b.maxY + 0.5))
    this.contact = buildContactShadows(unit, b)
    if (this.contact) this.unitGroup.add(this.contact)
    this.street = buildStreet(unit, b, this.ground.position.y)
    // the made-up street only from inside (none round the dollhouse); the site's real neighbours in every view, and the
    // shadow box reaches back toward the sun to take their shadows (fitShadow)
    ;(this.street.userData.site ? this.unitGroup : this.indoor).add(this.street)
    this.reach = this.street.userData.site ? SITE_REACH_M : 1

    // a light at each room's ceiling fixture (flush light, fan or pendant: presets.ts places one in every lit room),
    // biggest non-bath rooms first, then baths, up to the cap
    const lit = [...rooms].sort((a, b) => Number(a.kind === 'bath') - Number(b.kind === 'bath') || b.areaSqm - a.areaSqm)
    for (const room of lit) {
      const hung = unit.furniture.find((p) => p.roomId === room.id && isCeilingLight(p.assetId))
      if (!hung || this.lights.length >= MAX_ROOM_LIGHTS) continue
      const at = { x: hung.x, y: hung.y }
      // just under a flush diffuser; at the fan's light kit / the pendant's globe
      const lightY = ceilingOf(room) - Math.max(0.12, 0.8 * placementSize(hung).y)
      const reach = Math.max(...core.roomPolygon(room, unit).map((p) => Math.hypot(p.x - at.x, p.y - at.y)))
      // a point light 5 cm under the ceiling burns a hotspot into it; a downward spot is a real diffuser/pendant
      // with an opaque top — and its falloff leaves a pool on the floor, darker corners. Same per-fragment cost.
      // an opal diffuser / globe gives off light like a Lambertian disc, I0·cos θ: an 83° cone with a full penumbra is
      // smoothstep(cos 83°, 1, cos θ) ≈ cos θ — the walls lit up to near the ceiling, falling off as a real lamp's
      const light = new THREE.SpotLight(WARM, 0, reach + 1.5, THREE.MathUtils.degToRad(83), 1, 2)
      light.position.set(at.x, lightY, at.y)
      light.target.position.set(at.x, level(room, at.x, at.y), at.y)
      const sh = light.shadow
      sh.autoUpdate = false // drawn when picked (render) or when what it sees changed
      sh.mapSize.setScalar(this.casters > 1 ? 1024 : 512)
      sh.focus = 0.85 // a 141° frustum: a 166° one spends its texels on the walls' tops
      sh.camera.near = 0.1
      sh.bias = -0.0004
      sh.normalBias = 0.02
      sh.radius = 3
      this.lights.push({ light, base: lampCandela(room.areaSqm), id: hung.id, room: core.roomPolygon(room, unit) })
      this.unitGroup.add(light, light.target)
    }
    // the same number of shadow-casting lamps whatever the camera does (a count change recompiles every material)
    this.lights.forEach((l, i) => (l.light.castShadow = i < this.casters))
    this.pickedAt.set(Infinity, 0, 0)
    this.coverLights(unit, rooms, cover)
    this.unitGroup.add(slab, this.indoor)
  }

  /**
   * Under the slab above (`cover`: a basement, the parking under a tower) a zone gets no sky: LED battens hang on a world
   * 3.6 m grid from its soffit (one emissive mesh), and the battens farthest apart carry a real downlight each — up to
   * COVER_LIGHTS, within the light budget beside the rooms' lamps. Always on, whatever the hour.
   */
  private coverLights(unit: Unit, rooms: Room[], cover: Pt[][]): void {
    const spots: { x: number; y: number; floor: number }[] = []
    for (const r of rooms.filter((x) => isCovered(x, cover))) {
      const poly = core.roomInnerPolygon(r, unit)
      const xs = poly.map((p) => p.x)
      const ys = poly.map((p) => p.y)
      for (let i = Math.floor(Math.min(...xs) / GRID); i * GRID <= Math.max(...xs); i++)
        for (let j = Math.floor(Math.min(...ys) / GRID); j * GRID <= Math.max(...ys); j++) {
          const p = { x: (i + 0.5) * GRID, y: (j + 0.5) * GRID }
          if (core.pointInPolygon(p, poly) && cover.some((c) => core.pointInPolygon(p, c))) spots.push({ ...p, floor: core.roomLevelAt(r, unit, p.x, p.y) })
        }
    }
    if (!spots.length) return
    const y = this.topY - 0.03
    const battens = mergeGeometries(spots.map((p) => new THREE.BoxGeometry(1.2, 0.04, 0.08).translate(p.x, y, p.y)))!
    this.indoor.add(new THREE.Mesh(battens, BATTEN))
    // farthest-point picks: the first, then each time the spot farthest from those picked
    const picked = [spots[0]]
    const far = (p: (typeof spots)[number]) => Math.min(...picked.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))
    while (picked.length < Math.min(COVER_LIGHTS, spots.length)) picked.push(spots.reduce((a, b) => (far(b) > far(a) ? b : a)))
    for (const p of picked) {
      const light = new THREE.SpotLight(BATTEN.emissive, COVER_CD, 12, Math.PI / 2.3, 0.8, 2)
      light.position.set(p.x, y - 0.05, p.y)
      light.target.position.set(p.x, p.floor, p.y)
      this.unitGroup.add(light, light.target) // not in `indoor`: a light count that changes with the camera recompiles every material
    }
  }

  /** Arrange moved pieces: the contact shadows are redrawn (one canvas) and each room light follows its fixture. */
  setFurniture(unit: Unit): void {
    const c = this.contact
    if (c) {
      c.removeFromParent()
      c.geometry.dispose()
      const m = c.material as THREE.MeshBasicMaterial
      m.alphaMap?.dispose()
      m.dispose()
    }
    this.contact = buildContactShadows(unit, core.unitBounds(unit))
    if (this.contact) this.unitGroup.add(this.contact)
    for (const { light, id } of this.lights) {
      const p = unit.furniture.find((x) => x.id === id)
      if (!p) continue
      light.position.x = p.x
      light.position.z = p.y
      light.target.position.x = p.x // its y: the floor under it (setUnit)
      light.target.position.z = p.y
      light.shadow.needsUpdate = light.castShadow
      this.renderer.shadowMap.needsUpdate ||= light.castShadow
    }
  }

  /**
   * Call after the sun has been placed: its altitude in degrees (under the horizon: below 0). Sunlight and the flat's own
   * lamps are the only light: the sky's fill, the exposure and the dome follow the sun (skyLight); the lamps add their
   * own pools and their bounce.
   */
  setAltitude(altDeg: number): void {
    this.alt = altDeg
    const k = skyLight(altDeg)
    this.renderer.toneMappingExposure = k.exposure
    const lamp = this.on && !this.outside ? 1 : 0
    // the hemisphere = the sky's share + the lamps' bounce (warm, mostly up from the lit floor)
    this.hemi.intensity = 1
    this.hemi.color.copy(HEMI_SKY).lerp(GOLDEN, 0.5 * k.golden).multiplyScalar(HEMI * k.fill).add(this.c.copy(WARM).multiplyScalar(BOUNCE_DOWN * lamp))
    this.hemi.groundColor.copy(HEMI_GROUND).multiplyScalar(HEMI * k.fill).add(this.c.copy(WARM).multiplyScalar(BOUNCE_UP * lamp))
    this.scene.environmentIntensity = ENV * k.fill
    // the daylight atlas (window falloff) weighs the sky's share of the indirect light; the lamps' bounce is even
    const sky = k.fill * (ENV + HEMI)
    dayMix.value = sky / (sky + lamp * (BOUNCE_UP + BOUNCE_DOWN) + 1e-6)
    outdoorFill.value = (HEMI * k.fill) / (HEMI * k.fill + lamp * (BOUNCE_UP + BOUNCE_DOWN) / 2 + 1e-6) // the street gets no lamp bounce
    // the dome: the photo sky, golden when low, dimming as it sets; then the twilight gradient (as seen ÷ exposure)
    const seen = Math.min(1, k.fill * k.exposure)
    const tint = this.sky.material.color.setRGB(1, 1, 1).lerp(GOLDEN, k.golden).multiplyScalar(seen / k.exposure)
    const tw = twilight(altDeg)
    this.dome.night.value = k.night
    this.dome.zenith.value.copy(tw.zenith).multiplyScalar(1 / k.exposure)
    this.dome.horizon.value.copy(tw.horizon).multiplyScalar(1 / k.exposure)
    this.dome.glow.value.copy(tw.glow).multiplyScalar(1 / k.exposure)
    const toSun = this.v.copy(this.sun.position).sub(this.sun.target.position)
    this.dome.sunDir.value.set(toSun.x, 0, toSun.z).normalize()
    setHaze(tint)
    // the haze (and the dome under the horizon, which a dollhouse looks down on) at dusk / night: between the horizon and
    // the sky overhead, darker — the horizon's own pink alone filled the whole background at 17:45
    haze.value.lerp(this.c.copy(this.dome.horizon.value).lerp(this.dome.zenith.value, 0.7).multiplyScalar(0.7), k.night)
    const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    // the panes mirror this sky — at night, the lamps on, the lit room instead (faintly: the interior light probe, warm)
    const room = this.on && k.night > 0.5 && this.paneEnvs.room
    const env = (room ? this.paneEnvs.room : this.paneEnvs.sky) ?? null
    for (const m of PANES) if (m.envMap !== env && env) (m.envMap = env), (m.needsUpdate = true)
    setGlassSky(room ? PANE_ROOM : THREE.MathUtils.lerp(lum(tint), lum(this.dome.horizon.value), k.night))
    setLeafGlow(k.fill + 0.1 * lamp)
    // the catcher draws its colour wherever the sun's map says shadow: under the horizon that is everywhere (a brown plane)
    ;(this.catcher.material as THREE.ShadowMaterial).opacity = 0.35 * THREE.MathUtils.smoothstep(altDeg, 0, 3)
    this.fitShadow()
  }

  /** The flat's lamps on or off (lightsOn): their candela, the fixtures' glow, their bounce. */
  setLights(on: boolean): void {
    const lit = on && !this.on // just switched on: the shadow-casting lamps draw their maps (off, none were kept up)
    this.on = on
    for (const { light, base } of this.lights) light.intensity = on ? base : 0
    for (const [m, e] of this.glows) m.emissiveIntensity = on ? e * ON_GLOW : 0
    if (lit) for (const l of this.lights) l.light.shadow.needsUpdate = l.light.castShadow
    this.renderer.shadowMap.needsUpdate ||= lit
    this.pickedAt.set(Infinity, 0, 0)
    this.setAltitude(this.alt)
  }

  /** Lite and still slow (PlotlineScene.shadowsOff): no lamp casts a shadow, now or after the next setUnit. */
  lampShadowsOff(): void {
    this.casters = 0
    for (const { light } of this.lights) light.castShadow = false
  }

  /** A ceiling light's materials (a mounted piece): those that glow (emissive) follow the lamps. */
  addGlows(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m?.isMeshStandardMaterial || this.glows.has(m) || (!m.emissiveMap && m.emissive.getHex() === 0)) return
      if (m.emissive.getHex() === 0) m.emissive.set('#fff0dc') // an emissive map with no factor (the fan's light kit): it never glowed
      this.glows.set(m, m.emissiveIntensity)
      m.emissiveIntensity = this.on ? m.emissiveIntensity * ON_GLOW : 0
    })
  }

  /** Orthographic shadow frustum fitted to the unit box (and its shadow on the catcher) in light space. */
  private fitShadow(): void {
    const cam = this.sun.shadow.camera
    cam.position.copy(this.sun.position)
    cam.lookAt(this.sun.target.position) // same orientation DirectionalLightShadow.updateMatrices uses
    cam.updateMatrixWorld()
    const toSun = this.v.copy(this.sun.position).sub(this.sun.target.position).normalize()
    const drop = (this.fitBox.max.y - this.fitBox.min.y) / Math.max(toSun.y, 0.05) // top corner → its shadow on the catcher
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity)
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    const p = new THREE.Vector3()
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? this.fitBox.max.x : this.fitBox.min.x, i & 2 ? this.fitBox.max.y : this.fitBox.min.y, i & 4 ? this.fitBox.max.z : this.fitBox.min.z)
      if (i & 2) {
        const q = p.clone().addScaledVector(toSun, -drop).applyMatrix4(cam.matrixWorldInverse)
        lo.min(q)
        hi.max(q)
      }
      p.applyMatrix4(cam.matrixWorldInverse)
      lo.min(p)
      hi.max(p)
    }
    cam.left = lo.x
    cam.right = hi.x
    cam.bottom = lo.y
    cam.top = hi.y
    cam.near = Math.max(0.1, -hi.z - this.reach)
    cam.far = -lo.z + 1
    // the bias is in the shadow map's depth units: keep it ≈ 2 cm in the room whatever the depth range (a site's reach made
    // the range 10× deeper, and −0.0005 of it 17 cm: walls and sills shadowed late)
    this.sun.shadow.bias = -SHADOW_BIAS_M / (cam.far - cam.near)
    cam.updateProjectionMatrix()
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h)
  }

  render(): void {
    const under = this.camera.getWorldPosition(this.v).y < this.topY
    this.sky.position.copy(this.v)
    this.indoor.visible = under
    this.catcher.visible = !under
    const key = this.casterKey()
    if (key !== this.shadowKey) {
      this.renderer.shadowMap.needsUpdate = true
      this.sun.shadow.needsUpdate = true
      for (const l of this.lights) if (l.light.castShadow) l.light.shadow.needsUpdate = true
      this.shadowKey = key
    }
    this.pickLampShadows()
    if (this.composer && !this.renderer.xr.isPresenting) {
      // AO from the depth RenderPass is about to write (normals reconstructed): no second geometry pass, and
      // alpha-tested leaves occlude as drawn. Re-pointed per frame so GTAO never samples the target it writes.
      this.ao!.setGBuffer(this.composer.readBuffer.depthTexture!)
      this.composer.render()
    } else this.renderer.render(this.scene, this.camera)
  }

  /**
   * The lamps nearest the camera cast shadows (pickCasters, CASTERS of them), re-picked once the camera has moved 0.5 m;
   * a lamp that starts casting has its map drawn on this frame, the others keep theirs. Lamps off: nothing to draw.
   */
  private pickLampShadows(): void {
    if (!this.on || !this.casters || this.lights.length <= this.casters || this.v.distanceTo(this.pickedAt) < 0.5) return
    this.pickedAt.copy(this.v)
    const here = (poly: Pt[]) => core.pointInPolygon({ x: this.v.x, y: this.v.z }, poly)
    const pick = new Set(pickCasters(this.lights.map((l) => ({ x: l.light.position.x, z: l.light.position.z, here: here(l.room) })), { x: this.v.x, z: this.v.z }, this.casters))
    this.lights.forEach(({ light }, i) => {
      const cast = pick.has(i)
      if (cast && !light.castShadow) {
        light.shadow.needsUpdate = true
        this.renderer.shadowMap.needsUpdate = true
      }
      light.castShadow = cast
    })
  }

  /**
   * The sun's shadow map is drawn again only when what it sees changed (renderer.shadowMap.autoUpdate is off): it cost
   * ~590 draw calls and 0.7–1.1 M triangles every frame though nothing moves (measured 2026-10-04). This sums the sun,
   * the shadow frustum and every visible shadow caster's world transform (a piece moved, turned, added, deleted or
   * rebuilt; a door leaf shut; the tower or the storey above shown; the hour) — a change redraws it a frame later at most.
   */
  private casterKey(): number {
    const c = this.sun.shadow.camera
    // the map size too: VR swaps it (xr.ts setShadow) and three allocates the new map only when it draws
    let k = this.sun.position.x + 3 * this.sun.position.y + 7 * this.sun.position.z + c.left + 3 * c.right + 7 * c.top + 13 * c.bottom + 17 * c.near + 19 * c.far + 23 * this.sun.shadow.mapSize.x
    let n = 0
    this.scene.traverseVisible((o) => {
      if (!o.castShadow || !(o as THREE.Mesh).isMesh) return
      const e = o.matrixWorld.elements
      n++
      k += ((n % 89) + 1) * (e[0] + 2 * e[2] + 3 * e[8] + 5 * e[10] + 7 * e[12] + 11 * e[13] + 13 * e[14] + e[5]) + o.id * 1e-4
    })
    return k + n * 1e6
  }

  /** The context meshes' own materials and the shadow mask (their geometry goes with unitGroup's). */
  private disposeContext(): void {
    const c = this.contact?.material as THREE.MeshBasicMaterial | undefined
    c?.alphaMap?.dispose()
    c?.dispose()
    this.street?.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose())
    this.contact = this.street = null
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored)
    this.unitGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.())
    this.disposeContext()
    for (const m of [this.ground, this.catcher, this.sky]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose()
      this.composer.dispose()
    }
  }
}
