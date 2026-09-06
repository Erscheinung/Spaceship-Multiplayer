export const SHIP_COLORS = { cyan: '#19cddd', coral: '#ef657b', gold: '#efb941', violet: '#9d83e5', mint: '#62c695' };
export const DIFFICULTIES = {
  easy: { label: 'Scenic', spawn: 1.3, speed: .8, damage: 1, aim: true },
  normal: { label: 'Survival', spawn: .72, speed: 1.2, damage: 1, aim: true },
  brutal: { label: 'Brutal', spawn: .38, speed: 1.7, damage: 2, aim: false }
};
export function flightSettings(value = {}) {
  return { difficulty: Object.hasOwn(DIFFICULTIES, value.difficulty) ? value.difficulty : 'normal',
    colors: [0, 1].map(i => Object.hasOwn(SHIP_COLORS, value.colors?.[i]) ? value.colors[i] : i ? 'coral' : 'cyan') };
}
