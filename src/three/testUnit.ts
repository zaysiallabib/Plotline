/**
 * Hand-built dev unit: living + bed sharing a wall with a door, two windows,
 * one 45° chamfered corner, plain colour finishes, two placeholder furniture
 * placements. Used by ViewerApp when src/data/units/ is empty.
 */
import type { Unit, Vertex, Wall } from '../core'

const V = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const W = (id: string, a: string, b: string, thicknessM: number, openings: Wall['openings'] = []): Wall => ({
  id,
  a,
  b,
  thicknessM,
  heightM: 3,
  openings,
})

export const TEST_UNIT: Unit = {
  id: 'test-unit',
  projectName: 'Dev',
  name: 'Test · 2 rooms',
  northDeg: 0,
  areaSqft: 387,
  vertices: [
    V('v1a', 0.8, 0),
    V('v1b', 0, 0.8),
    V('v2', 5, 0),
    V('v3', 5, 4),
    V('v4', 0, 4),
    V('v5', 9, 0),
    V('v6', 9, 4),
  ],
  walls: [
    W('w1', 'v1a', 'v2', 0.25, [{ id: 'win1', kind: 'window', offsetM: 1.4, widthM: 1.6, heightM: 1.4, sillM: 0.9 }]),
    W('w2', 'v2', 'v5', 0.25),
    W('w3', 'v5', 'v6', 0.25, [{ id: 'win2', kind: 'window', offsetM: 1.2, widthM: 1.5, heightM: 1.4, sillM: 0.9 }]),
    W('w4', 'v6', 'v3', 0.25),
    W('w5', 'v3', 'v4', 0.25),
    W('w6', 'v4', 'v1b', 0.25),
    W('w7', 'v1b', 'v1a', 0.25),
    W('w8', 'v2', 'v3', 0.127, [
      { id: 'door1', kind: 'door', offsetM: 2.4, widthM: 0.9, heightM: 2.1, sillM: 0, hinge: 'b', swing: 'in' },
    ]),
  ],
  roomLabels: [
    { id: 'living', name: 'Living', kind: 'living', x: 2.5, y: 2 },
    { id: 'bed', name: 'Bed-1', kind: 'bed', x: 7, y: 2 },
  ],
  furniture: [
    { id: 'f1', assetId: 'sofa_01', roomId: 'living', x: 2.5, y: 3.2, rotationDeg: 180 },
    { id: 'f2', assetId: 'bed_01', roomId: 'bed', x: 7, y: 1.5, rotationDeg: 0 },
  ],
  finishSlots: [
    {
      id: 'floors',
      label: 'Floors',
      target: 'floor',
      roomIds: 'all',
      defaultOptionId: 'oak',
      options: [
        { id: 'oak', brand: 'Dev', sku: 'oak', label: 'Oak', priceDeltaBdt: 0, material: { kind: 'color', color: '#a37f5a', roughness: 0.6 } },
        { id: 'marble', brand: 'Dev', sku: 'marble', label: 'Marble', priceDeltaBdt: 0, material: { kind: 'color', color: '#e4e0d8', roughness: 0.3 } },
      ],
    },
    {
      id: 'walls',
      label: 'Walls',
      target: 'wall',
      roomIds: 'all',
      defaultOptionId: 'ivory',
      options: [
        { id: 'ivory', brand: 'Dev', sku: 'ivory', label: 'Ivory', priceDeltaBdt: 0, material: { kind: 'color', color: '#f0e9dc' } },
      ],
    },
    {
      id: 'bed-walls',
      label: 'Bedroom walls',
      target: 'wall',
      roomIds: ['bed'],
      defaultOptionId: 'sage',
      options: [
        { id: 'sage', brand: 'Dev', sku: 'sage', label: 'Sage', priceDeltaBdt: 0, material: { kind: 'color', color: '#b9c4b0' } },
        { id: 'ivory2', brand: 'Dev', sku: 'ivory', label: 'Ivory', priceDeltaBdt: 0, material: { kind: 'color', color: '#f0e9dc' } },
      ],
    },
  ],
}
