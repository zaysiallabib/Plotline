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
import type { Room, Unit } from '../core'
import { isCeilingLight, kitAsset } from '../furnish/kit'
import { fixtureGlow } from '../furnish/procedural'
import { buildContactShadows, buildStreet, haze, hazed, setHaze } from './context'
import { EXTERIOR_PLASTER, materialFor } from './materials'
import { GLASS, GLASS_SKY } from './openings'

export type Quality = 'high' | 'low'

const STOREY_M = 3.2
const SLAB_M = 0.15
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
/** point-light candela per m² of room at full daylight; ×DUSK_BOOST at dusk */
const LIGHT_CD_PER_M2 = 0.1
const DUSK_BOOST = 8
/** + sun + hemisphere = 10 lights: forward shading pays for every light on every lit fragment */
const MAX_ROOM_LIGHTS = 8
/** no storey above: AOD shafts, the planter and the small recessed verandas get sun from above */
const openToSky = (r: Room) => r.kind === 'shaft' || (r.kind === 'balcony' && r.areaSqm < 5)

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
  private lights: { light: THREE.SpotLight; base: number }[] = []
  private readonly fitBox = new THREE.Box3()
  private topY = 3
  private readonly v = new THREE.Vector3()

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.DirectionalLight,
    quality: Quality,
  ) {
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = EXPOSURE
    renderer.shadowMap.enabled = true
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
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 0.5, scale: 1, samples: 16 })
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 })
      ao.blendIntensity = 0.9
      this.composer.addPass(ao)
      this.composer.addPass(new OutputPass())
    }
  }

  /** Equirect sky texture for the dome; lighting stays on the interior HDRI. */
  setSky(tex: THREE.Texture): void {
    this.sky.material.map?.dispose() // context restore reloads it
    this.sky.material.map = tex
    this.sky.material.needsUpdate = true
  }

  /** Per-unit: slab + roof, catcher, ground level, a light at each ceiling fixture placement. */
  setUnit(unit: Unit, rooms: Room[]): void {
    this.unitGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.())
    this.disposeContext()
    this.unitGroup.clear()
    this.indoor.clear()
    this.lights = []

    const heights = new Map(unit.walls.map((w) => [w.id, w.heightM]))
    const ceilingOf = (r: Room) => Math.max(...r.wallIds.map((id) => heights.get(id) ?? 3)) // as buildRoom
    this.topY = Math.max(0, ...heights.values())

    // slab: room undersides (centreline polygons) + a box under every wall to reach the outer face
    const roomParts = rooms.map((r) =>
      new THREE.ShapeGeometry(new THREE.Shape(core.roomPolygon(r, unit).map((p) => new THREE.Vector2(p.x, p.y))))
        .rotateX(Math.PI / 2) // plan (x, y) → world (x, 0, z=y), facing down
        .translate(0, -SLAB_M, 0),
    )
    const wallParts = unit.walls.map((w) => {
      const f = core.wallFrame(w, unit.vertices)
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.dir.y, 0, f.dir.x))
      m.setPosition(f.origin.x + (f.dir.x * f.lengthM) / 2, -(SLAB_M + 0.001) / 2, f.origin.y + (f.dir.y * f.lengthM) / 2)
      return new THREE.BoxGeometry(f.lengthM + w.thicknessM, SLAB_M - 0.001, w.thicknessM).applyMatrix4(m)
    })
    const slabGeo = mergeGeometries([...roomParts, ...wallParts])
    const roofGeo = mergeGeometries([...roomParts.filter((_, i) => !openToSky(rooms[i])), ...wallParts])
    ;[...roomParts, ...wallParts].forEach((g) => g.dispose())
    const slab = new THREE.Mesh(slabGeo, materialFor(EXTERIOR_PLASTER))
    slab.castShadow = slab.receiveShadow = true
    // the storey above: ceilings don't cast, so without it the sun pours in through every ceiling
    const roof = new THREE.Mesh(roofGeo, slab.material)
    roof.position.y = this.topY + SLAB_M + 0.005 // underside 5 mm above the ceiling plane: no z-fight
    roof.castShadow = true
    this.indoor.add(roof)

    const b = core.unitBounds(unit)
    this.catcher.position.set((b.minX + b.maxX) / 2, -SLAB_M - 0.01, (b.minY + b.maxY) / 2)
    this.ground.position.y = -(unit.floor ?? 0) * STOREY_M - 0.2
    this.fitBox.set(new THREE.Vector3(b.minX - 0.5, -SLAB_M - 0.05, b.minY - 0.5), new THREE.Vector3(b.maxX + 0.5, this.topY + SLAB_M + 0.05, b.maxY + 0.5))
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
      const lightY = ceilingOf(room) - Math.max(0.12, 0.8 * (kitAsset(hung.assetId)?.sizeM.y ?? 0.5))
      const reach = Math.max(...core.roomPolygon(room, unit).map((p) => Math.hypot(p.x - at.x, p.y - at.y)))
      // a point light 5 cm under the ceiling burns a hotspot into it; a downward spot is a real diffuser/pendant
      // with an opaque top — and its falloff leaves a pool on the floor, darker corners. Same per-fragment cost.
      const light = new THREE.SpotLight(WARM, 0, reach + 1.5, Math.PI / 2.6, 0.6, 2)
      light.position.set(at.x, lightY, at.y)
      light.target.position.set(at.x, 0, at.y)
      this.lights.push({ light, base: LIGHT_CD_PER_M2 * Math.max(6, room.areaSqm) })
      this.unitGroup.add(light, light.target)
    }
    this.unitGroup.add(slab, this.indoor)
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
    this.scene.environmentIntensity = ENV * (1 - 0.55 * dusk)
    const sky = this.sky.material.color.setRGB(1, 1, 1).lerp(GOLDEN, golden).lerp(DUSK_SKY, dusk)
    setHaze(sky)
    GLASS.envMapIntensity = GLASS_SKY * (0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b) // the panes mirror this sky
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
    if (this.composer && !this.renderer.xr.isPresenting) {
      // AO from the depth RenderPass is about to write (normals reconstructed): no second geometry pass, and
      // alpha-tested leaves occlude as drawn. Re-pointed per frame so GTAO never samples the target it writes.
      this.ao!.setGBuffer(this.composer.readBuffer.depthTexture!)
      this.composer.render()
    } else this.renderer.render(this.scene, this.camera)
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
