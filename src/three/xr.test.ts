/** Pure pieces of the WebXR controls: head-offset compensation, snap turn about the head, teleport verdicts. */
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { rigForHead, snapTurn, SNAP_RAD, teleportVerdict, turnAbout } from './xr'

describe('rigForHead', () => {
  test('puts the head, not the rig origin, on the target', () => {
    const rig = { x: 2, y: 3 }
    const head = { x: 2.4, y: 2.7 } // player stood 0.4 m right, 0.3 m forward of the rig origin
    const next = rigForHead({ x: 5, y: 1 }, head, rig)
    expect(next.x + (head.x - rig.x)).toBeCloseTo(5)
    expect(next.y + (head.y - rig.y)).toBeCloseTo(1)
  })
})

describe('turnAbout', () => {
  // the rig carries the head: head world = rig + Ry(yaw) · local. Rotating the rig about the head keeps the head fixed.
  const headWorld = (rig: { x: number; y: number }, yaw: number, local: THREE.Vector3) => {
    const v = local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    return { x: rig.x + v.x, y: rig.y + v.z }
  }

  test.each([SNAP_RAD, -SNAP_RAD, Math.PI])('head stays put for a %f rad turn', (angle) => {
    const local = new THREE.Vector3(0.5, 1.6, -0.3) // head offset inside the rig
    const rig = { x: 1, y: 4 }
    const yaw = 0.3
    const head = headWorld(rig, yaw, local)
    const after = headWorld(turnAbout(rig, head, angle), yaw + angle, local)
    expect(after.x).toBeCloseTo(head.x)
    expect(after.y).toBeCloseTo(head.y)
  })

  test('head at the rig origin → rig does not move', () => {
    expect(turnAbout({ x: 1, y: 2 }, { x: 1, y: 2 }, SNAP_RAD)).toEqual({ x: 1, y: 2 })
  })
})

describe('snapTurn', () => {
  test('fires once past 0.6, re-arms only under 0.3; right = −45°', () => {
    const s = { armed: true }
    expect(snapTurn(s, 0.5)).toBe(0)
    expect(snapTurn(s, 0.7)).toBe(-SNAP_RAD)
    expect(snapTurn(s, 0.9)).toBe(0) // held: no repeat
    expect(snapTurn(s, 0.4)).toBe(0) // not re-armed yet
    expect(snapTurn(s, 0.8)).toBe(0)
    expect(snapTurn(s, 0.1)).toBe(0) // re-armed
    expect(snapTurn(s, -0.95)).toBe(SNAP_RAD)
  })
})

describe('teleportVerdict', () => {
  // floor 10×10 at y = 0, a 3 m wall across z = −3
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2))
  floor.userData = { kind: 'floor', id: 'r1', roomId: 'r1' }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.2))
  wall.position.set(0, 1.5, -3)
  wall.userData = { kind: 'wall', id: 'w1' }
  const world = new THREE.Group().add(floor, wall)
  world.updateMatrixWorld(true)
  const rc = new THREE.Raycaster()
  const cast = (to: THREE.Vector3) => {
    const from = new THREE.Vector3(0.2, 1.2, 0)
    rc.set(from, to.clone().sub(from).normalize())
    return rc.intersectObject(world, true)[0]
  }
  const anywhere = () => true

  test('floor 2 m ahead → ok', () => {
    expect(teleportVerdict(cast(new THREE.Vector3(0, 0, -2)), anywhere)).toBe('ok')
  })
  test('floor behind a wall → none (the wall is hit first)', () => {
    expect(teleportVerdict(cast(new THREE.Vector3(0, 0, -5)), anywhere)).toBe('none')
  })
  test('the wall itself → none', () => {
    expect(teleportVerdict(cast(new THREE.Vector3(0, 1.2, -3)), anywhere)).toBe('none')
  })
  test('nothing hit → none', () => {
    expect(teleportVerdict(cast(new THREE.Vector3(0, 5, 0)), anywhere)).toBe('none')
  })
  test('floor the walker may not stand on (outside / within 0.3 m of a wall) → blocked', () => {
    const tooClose = (p: THREE.Vector3) => p.z > -2.6
    expect(teleportVerdict(cast(new THREE.Vector3(0, 0, -2.8)), tooClose)).toBe('blocked')
    expect(teleportVerdict(cast(new THREE.Vector3(0, 0, -2)), tooClose)).toBe('ok')
  })
})
