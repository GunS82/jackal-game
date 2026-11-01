// Единая карта ассетов. Картинка клетки: assets/tiles/<ключ>.svg, фишки: assets/pieces/*.svg.
// Если файла нет — показывается эмодзи (запасной вариант). label — подпись на клетке.
export const ASSETS = {
  closed:  { emoji: '🌴', label: '', img: true },
  empty:   { emoji: '', label: 'пусто', img: true },
  arrow:   { emoji: '', label: 'стрелка', img: true },
  horse:   { emoji: '🐎', label: 'конь', img: true },
  spin2:   { emoji: '🌿', label: 'джунгли 2', img: true },
  spin3:   { emoji: '🏜️', label: 'пустыня 3', img: true },
  spin4:   { emoji: '🐸', label: 'болото 4', img: true },
  spin5:   { emoji: '⛰️', label: 'горы 5', img: true },
  ice:     { emoji: '🧊', label: 'лёд', img: true },
  trap:    { emoji: '🪤', label: 'капкан', img: true },
  croc:    { emoji: '🐊', label: 'крокодил', img: true },
  ogre:    { emoji: '👹', label: 'людоед', img: true },
  fort:    { emoji: '🏰', label: 'крепость', img: true },
  abor:    { emoji: '🏯', label: 'аборигенка', img: true },
  chest1:  { emoji: '🧰', label: 'сундук I', img: true },
  chest2:  { emoji: '🧰', label: 'сундук II', img: true },
  chest3:  { emoji: '🧰', label: 'сундук III', img: true },
  chest4:  { emoji: '🧰', label: 'сундук IV', img: true },
  chest5:  { emoji: '🧰', label: 'сундук V', img: true },
  plane:   { emoji: '✈️', label: 'самолёт', img: true },
  balloon: { emoji: '🎈', label: 'шар', img: true },
  cannon:  { emoji: '💣', label: 'пушка', img: true },
  barrel:  { emoji: '🛢️', label: 'бочонок', img: true },
  rum1:    { emoji: '🍾', label: 'ром 1', img: true },
  rum2:    { emoji: '🍾', label: 'ром 2', img: true },
  rum3:    { emoji: '🍾', label: 'ром 3', img: true },
  cave:       { emoji: '🕳️', label: 'пещера', img: true },
  quake:      { emoji: '🌋', label: 'землетрясение', img: true },
  jungle:     { emoji: '🌳', label: 'джунгли', img: true },
  grass:      { emoji: '🔥', label: 'трава', img: true },
  caramba:    { emoji: '🤬', label: 'каррамба', img: true },
  lighthouse: { emoji: '🗼', label: 'маяк', img: true },
  bengunn:    { emoji: '🧔', label: 'Бен Ганн', img: true },
  missionary: { emoji: '🙏', label: 'миссионер', img: true },
  friday:     { emoji: '🧑', label: 'Пятница', img: true },
  galleon:    { emoji: '💰', label: 'галеон', img: true },
  sea:     { emoji: '', label: '', img: true },
  ship:    { emoji: '⛵', label: '', img: true },
  coin:    { emoji: '🪙', label: '', img: true },
};
export const ARROW_GLYPH = { '0,-1': '↑', '1,-1': '↗', '1,0': '→', '1,1': '↘', '0,1': '↓', '-1,1': '↙', '-1,0': '←', '-1,-1': '↖' };

export const TEAM_COLOR = ['white', 'yellow', 'black', 'red'];
const ARROW_BASE = ['arrow1', 'arrow1d', 'arrow2', 'arrow2d', 'arrow3', 'arrow4', 'arrow4d'];
// Путь к картинке клетки: стрелки — по виду (arrow1…arrow4d), остриё вверх, поворот задаёт ui.
export function tileImg(t) {
  if (!t.open) return 'assets/tiles/closed.svg';
  if (t.kind === 'arrow') return ARROW_BASE.includes(t.arrow) ? `assets/tiles/${t.arrow}.svg` : null;
  if (t.kind === 'plane' && t.used) return 'assets/tiles/empty.svg';
  return ASSETS[t.kind]?.img ? `assets/tiles/${t.kind}.svg` : null;
}
export const pirateImg = team => `assets/pieces/pirate-${TEAM_COLOR[team]}.svg`;
export const shipImg = team => `assets/pieces/ship-${TEAM_COLOR[team]}.svg`;
export const coinImg = 'assets/pieces/coin.svg';
export const treasureImg = 'assets/pieces/treasure.svg';
export const hlImg = kind => `assets/ui/hl-${kind}.svg`; // слои подсветки ходов: move / death / coin
// Отдельных фишек персонажей у Дизайнера нет: фишка цвета команды + значок роли.
export const ROLE_BADGE = { bengunn: '🧔', friday: '🧑', missionary: '🙏', exmissionary: '✝' };
