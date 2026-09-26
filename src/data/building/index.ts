/** The towers the Building view knows; a flat belongs to at most one. */
import type { Unit } from '../../core'
import * as bti from './demo-tower'
import * as sheltech from './sheltech-tower'

export type Tower = typeof bti

const TOWERS: Tower[] = [bti, sheltech]

/** The tower whose FLATS hold this unit (by id), or null: no Building view. */
export const towerOf = (unit: Unit): Tower | null =>
  TOWERS.find((t) => Object.values(t.FLATS).some((f) => f.unit.id === unit.id)) ?? null
