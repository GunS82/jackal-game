# Ассеты

Все картинки квадратные SVG (viewBox 0 0 100 100). Генератор: `assets/make_assets.py` (дизайнер). Карта ключей — `src/assets.js`; если файла нет, показывается эмодзи.

## assets/tiles/ (клетки, имя = ключ клетки)
- `abor.svg`
- `arrow1.svg`
- `arrow1d.svg`
- `arrow2.svg`
- `arrow2d.svg`
- `arrow3.svg`
- `arrow4.svg`
- `arrow4d.svg`
- `balloon.svg`
- `barrel.svg`
- `cannon.svg`
- `chest1.svg`
- `chest2.svg`
- `chest3.svg`
- `chest4.svg`
- `chest5.svg`
- `closed.svg`
- `croc.svg`
- `empty.svg`
- `fort.svg`
- `horse.svg`
- `ice.svg`
- `ogre.svg`
- `plane.svg`
- `rum1.svg`
- `rum2.svg`
- `rum3.svg`
- `sea.svg`
- `spin2.svg`
- `spin3.svg`
- `spin4.svg`
- `spin5.svg`
- `trap.svg`

Стрелки (arrow1 — прямая, arrow1d — диагональ, arrow2/arrow2d — двойные, arrow3 — тройная, arrow4/arrow4d — четверные) нарисованы в базовой ориентации остриём вверх; поворот на 90°·rot делает код (`tileRotation`). Пушка (cannon) — дуло вверх, тоже поворачивается. `closed.svg` — рубашка, `sea.svg` — море, использованный самолёт рисуется как `empty.svg`.

## assets/pieces/ (фишки)
- `coin.svg`
- `pirate-black.svg`
- `pirate-red.svg`
- `pirate-white.svg`
- `pirate-yellow.svg`
- `ship-black.svg`
- `ship-red.svg`
- `ship-white.svg`
- `ship-yellow.svg`

Цвета команд: white (0), yellow (1), black (2), red (3).
