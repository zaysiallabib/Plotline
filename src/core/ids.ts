/** Stable unique ids. stdlib — no ulid dependency needed. */
export const newId = (): string => crypto.randomUUID()
