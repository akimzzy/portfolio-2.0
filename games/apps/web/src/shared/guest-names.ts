const ADJECTIVES = ["Bright", "Clever", "Golden", "Happy", "Merry", "Quiet", "Swift", "Witty"];
const ANIMALS = ["Badger", "Comet", "Falcon", "Fox", "Otter", "Panda", "Raven", "Tiger"];

/** Same lightweight guest-name format for people and generated opponents. */
export function randomDisplayName(): string {
  const values = new Uint32Array(3);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
  else
    for (let index = 0; index < values.length; index += 1)
      values[index] = Math.floor(Math.random() * 2 ** 32);
  return `${ADJECTIVES[(values[0] ?? 0) % ADJECTIVES.length]} ${ANIMALS[(values[1] ?? 0) % ANIMALS.length]} ${(values[2] ?? 0) % 100}`;
}

/** Generate lobby identities once and avoid duplicate names within the visible set. */
export function uniqueDisplayNames(count: number): string[] {
  const names: string[] = [];
  while (names.length < count) {
    const base = randomDisplayName();
    let candidate = base;
    for (let suffix = 2; names.includes(candidate); suffix += 1) candidate = `${base} ${suffix}`;
    names.push(candidate);
  }
  return names;
}
