export function getSpeakerIndex(speaker, map) {
  const key = speaker || "default";
  if (!map.has(key)) {
    map.set(key, map.size % 8);
  }
  return map.get(key);
}
