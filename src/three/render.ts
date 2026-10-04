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
import { fixtureGlow } from '../furnish/procedural'
import { buildContactShadows, buildStreet, haze, hazed, setHaze } from './context'
import { dayMix, isCovered, openToSky } from './daylight'
import { roomCeiling, storeyTop, wallLift } from './details'
import { EXTERIOR_PLASTER, materialFor } from './materials'
import { meterUVs, setGlassSky } from './openings'

export type Quality = 'high' | 'low'

const STOREY_M = 3.2
const SLAB_M = 0.15
const ROOF_LIFT = 0.04
// Measured on the living-room view (sRGB of shaded walls/ceiling): ENV 0.7/HEMI 0.6 → walls 160, ceiling 170;
// ENV 1.4/HEMI 1.2 → walls 221–231 — too close to white: a sun patch had no headroom left and the hour didn't show.
// 0.8/0.6 read grey (art director, wave 5); the midpoint 1.1/0.9 aims for walls ≈ 195–205.
const EXPOSURE = 1
const HEMI = 0.9
const ENV = 1.1
const HEMI_SKY = new THREE.Color('#e6e9ee') // barely cool: #dfe7f5 turned the warm-white walls grey
/** near-neutral: the old #d8cab6 ground tinted every ceiling peach */
const HEMI_GROUND = '#cfcbc4'
/** sky light + sky dome at sunrise / sunset (low sun) */
const GOLDEN = new THREE.Color('#ffd2a8')
/** sky dome at dusk: a warm multiply, not a grey dim */
const DUSK_SKY = new THREE.Color('#ffc9a0').multiplyScalar(0.55)
/** 3000 K blackbody (Mitchell Charity table) */
const WARM = '#ffb46b'
/**
 * Hemisphere ground colour at dusk: the lamps' light bounced off the lit floor and walls (the spots point down, so without
 * it the ceilings sat at sRGB 110–135 under walls at 145–150 at 18:00: a dim flat, not one with its lights on).
 */
const BOUNCE = new THREE.Color('#ffd9b0').multiplyScalar(2)
/** point-light candela per m² of room at full daylight; ×DUSK_BOOST at dusk */
const LIGHT_CD_PER_M2 = 0.1
const DUSK_BOOST = 8
/** + sun + hemisphere = 10 lights: forward shading pays for every light on every lit fragment */
const MAX_ROOM_LIGHTS = 8
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
  /** `id`: the fixture placement it hangs at */
  private lights: { light: THREE.SpotLight; base: number; id: string }[] = []
  private readonly fitBox = new THREE.Box3()
  private topY = 3
  private readonly v = new THREE.Vector3()
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
    renderer.toneMappingExposure = EXPOSURE
    renderer.shadowMap.enabled = !switchedOff('shadows')
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
    this.sky.material.onBeforeCompile = (s) => {
      s.uniforms.hazeColor = haze
      s.vertexShader = `varying float vSkyY;\n${s.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyY = normalize(position).y;')
      s.fragmentShader = `uniform vec3 hazeColor;\nvarying float vSkyY;\n${s.fragmentShader}`.replace(
        '#include <tonemapping_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, 1.0 - smoothstep(-0.03, 0.03, vSkyY));\n#include <tonemapping_fragment>',
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
    const box = (w: Unit['walls'][number], y: number) => {
      const f = core.wallFrame(w, unit.vertices)
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.dir.y, 0, f.dir.x))
      m.setPosition(f.origin.x + (f.dir.x * f.lengthM) / 2, y - (SLAB_M + 0.001) / 2, f.origin.y + (f.dir.y * f.lengthM) / 2)
      return meterUVs(new THREE.BoxGeometry(f.lengthM + w.thicknessM, SLAB_M - 0.001, w.thicknessM).applyMatrix4(m)) // the plaster scan, not stretched 0..1 per face
    }
    const wallParts = unit.walls.map((w) => box(w, 0))
    // under the floors: each wall's box under its lower side's floor; none under a flush line (the floors meet on it, and a
    // box there poked up through a ramp beside it)
    const footParts = unit.walls.flatMap((w) => (w.heightM > 0 ? [box(w, Math.min(...wallLift(w, unit, rooms).foot))] : []))
    // the roof closes no wall that stands only among open zones (a kerb, a boundary wall, a screen in a lawn): a beam at the
    // storey's top over it would hang in the sky and stripe the lawn with its shadow
    const open = (r: Room | null) => !r || (core.isOutdoor(r.kind) && !isCovered(r, cover))
    const roofWalls = unit.walls.flatMap((w, i) => {
      const s = sidesOf(w)
      return w.heightM > 0 && !(s.some((r) => r && core.isOutdoor(r.kind)) && s.every(open)) ? [wallParts[i]] : []
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
    ;[...roomParts, ...underFloors, ...wallParts, ...footParts, ...lifted, ...over].forEach((g) => g.dispose())
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
    this.ground.position.y = Math.min(-(unit.floor ?? 2) * STOREY_M - 0.2, lowest - 0.05)
    this.fitBox.set(new THREE.Vector3(b.minX - 0.5, lowest - SLAB_M - 0.05, b.minY - 0.5), new THREE.Vector3(b.maxX + 0.5, this.topY + SLAB_M + 0.05, b.maxY + 0.5))
    this.contact = buildContactShadows(unit, b)
    if (this.contact) this.unitGroup.add(this.contact)
    this.street = buildStreet(unit, b, this.ground.position.y)
    this.indoor.add(this.street)

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
      const light = new THREE.SpotLight(WARM, 0, reach + 1.5, Math.PI / 2.6, 0.6, 2)
      light.position.set(at.x, lightY, at.y)
      light.target.position.set(at.x, level(room, at.x, at.y), at.y)
      this.lights.push({ light, base: LIGHT_CD_PER_M2 * Math.max(6, room.areaSqm), id: hung.id })
      this.unitGroup.add(light, light.target)
    }
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
    }
  }

  /** Call after the sun has been placed for `hour`. */
  setHour(hour: number): void {
    // 0 by day → 1 at 18:00 (and before 07:30): sky light fades, the fixtures take over
    const dusk = Math.max(THREE.MathUtils.smoothstep(hour, 16.5, 18), 1 - THREE.MathUtils.smoothstep(hour, 6, 7.5))
    // 1 while the sun is low (07:00 / 17:00, altitude ≲ 14°) → 0 above ~30°: sky light and the sky itself go golden
    const alt = this.v.copy(this.sun.position).sub(this.sun.target.position).normalize().y
    const golden = 1 - THREE.MathUtils.smoothstep(alt, 0.24, 0.5)
    this.hemi.color.copy(HEMI_SKY).lerp(GOLDEN, 0.5 * golden)
    this.hemi.intensity = HEMI * (1 - 0.55 * dusk)
    this.hemi.groundColor.set(HEMI_GROUND).lerp(BOUNCE, dusk)
    this.scene.environmentIntensity = ENV * (1 - 0.55 * dusk)
    dayMix.value = 1 - dusk // after dark the lamps light the rooms, not the windows
    const sky = this.sky.material.color.setRGB(1, 1, 1).lerp(GOLDEN, golden).lerp(DUSK_SKY, dusk)
    setHaze(sky)
    setGlassSky(0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b) // the panes mirror this sky
    fixtureGlow().emissiveIntensity = 2.5 + 3.5 * dusk
    for (const { light, base } of this.lights) light.intensity = base * (1 + (DUSK_BOOST - 1) * dusk)
    this.fitShadow()
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
    cam.near = Math.max(0.1, -hi.z - 1)
    cam.far = -lo.z + 1
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
      this.shadowKey = key
    }
    if (this.composer && !this.renderer.xr.isPresenting) {
      // AO from the depth RenderPass is about to write (normals reconstructed): no second geometry pass, and
      // alpha-tested leaves occlude as drawn. Re-pointed per frame so GTAO never samples the target it writes.
      this.ao!.setGBuffer(this.composer.readBuffer.depthTexture!)
      this.composer.render()
    } else this.renderer.render(this.scene, this.camera)
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
