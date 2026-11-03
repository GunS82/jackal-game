# Макет мобильной раскладки v2 (412x915 CSS px), два экрана: ход Белых и ход Чёрных.
# Запуск: PYTHONPATH=/workspace/tools/py python3 design/mobile_v2.py
import cairosvg, os
PAR, INK, SEA, GOLD, BG = "#efe0bb", "#5a3b1e", "#2f8794", "#e3b23c", "#0d4a5e"
W, H = 412, 915
TOP_INSET, BOT_INSET = 24, 16          # пример env(safe-area-inset-*) на Android
TOPBAR, LOG = 44, 30
PANEL = 136                             # 2 ряда по 56 + отступы
N = 13; C = W / N                       # 31.7px — всё поле по ширине

def t(x, y, s, size=13, fill=INK, w="normal", anchor="start"):
    return f'<text x="{x}" y="{y}" font-family="DejaVu Sans" font-size="{size}" fill="{fill}" font-weight="{w}" text-anchor="{anchor}">{s}</text>'

def phone(ox, team):
    white = team == "w"
    me, foe = ("#ffffff", "#1b1b1b") if white else ("#1b1b1b", "#ffffff")
    g = [f'<g transform="translate({ox},60)">',
         f'<rect x="-6" y="-6" width="{W+12}" height="{H+12}" rx="26" fill="#222"/>',
         f'<rect width="{W}" height="{H}" fill="{BG}"/>']
    # статус-бар системы = ровно safe-area-inset-top
    g.append(f'<rect width="{W}" height="{TOP_INSET}" fill="#08303d"/>' + t(12, 17, "15:22", 11, "#cfe") +
             t(W-12, 17, "▮ 53%", 11, "#cfe", anchor="end"))
    y = TOP_INSET
    # верхняя панель 44px
    g.append(f'<rect x="4" y="{y+2}" width="40" height="40" rx="8" fill="{PAR}" stroke="{INK}" stroke-width="2"/>' + t(24, y+30, "☰", 22, INK, anchor="middle"))
    g.append(f'<rect x="52" y="{y+4}" width="222" height="36" rx="18" fill="{PAR}" stroke="{GOLD}" stroke-width="3"/>'
             f'<circle cx="72" cy="{y+22}" r="7" fill="{me}" stroke="{INK}" stroke-width="2"/>' +
             t(86, y+27, ("Ход Белых" if white else "Ход Чёрных") + " · №" + ("3" if white else "4"), 14, INK, "bold"))
    g.append(f'<rect x="282" y="{y+4}" width="126" height="36" rx="18" fill="{PAR}" stroke="{INK}" stroke-width="2"/>'
             f'<circle cx="300" cy="{y+22}" r="7" fill="#fff" stroke="{INK}" stroke-width="2"/>' + t(312, y+28, "1", 16, INK, "bold") +
             t(340, y+28, ":", 16, INK, "bold", "middle") +
             f'<circle cx="364" cy="{y+22}" r="7" fill="#1b1b1b" stroke="{INK}" stroke-width="2"/>' + t(376, y+28, "0", 16, INK, "bold"))
    y += TOPBAR
    # строка лога — свой ряд
    g.append(f'<rect y="{y}" width="{W}" height="{LOG}" fill="#0a3a4a"/>' +
             f'<circle cx="14" cy="{y+15}" r="5" fill="{foe}" stroke="{PAR}"/>' +
             t(26, y+20, ("№2 · Чёрные: открыта клетка «Джунгли»" if white else "№3 · Белые: пират Б2 вернулся на корабль"), 13, PAR) +
             t(W-10, y+20, "журнал ›", 12, GOLD, anchor="end"))
    y += LOG
    panel_top = H - BOT_INSET - PANEL
    avail = panel_top - y
    # карточка клетки (над полем, вне клеток) — подпись и бейдж справа от иконки
    card_h = 56
    by = y + (avail - card_h - 8 - W) / 2 + card_h + 8
    cy = by - card_h - 8
    g.append(f'<rect x="8" y="{cy}" width="{W-16}" height="{card_h}" rx="10" fill="{PAR}" stroke="{INK}" stroke-width="2"/>'
             f'<rect x="16" y="{cy+8}" width="40" height="40" rx="6" fill="#9fcf8a" stroke="{INK}" stroke-width="2"/>' +
             t(36, cy+35, "♣", 24, INK, anchor="middle") + t(66, cy+25, "Джунгли", 15, INK, "bold") +
             t(66, cy+44, "клетка-вертушка: 3 хода до выхода", 12, INK) +
             f'<rect x="{W-58}" y="{cy+16}" width="40" height="24" rx="12" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>' + t(W-38, cy+33, "3", 14, INK, "bold", "middle"))
    # поле 13x13 целиком: море по краю, корабли видны оба
    g.append(f'<rect x="0" y="{by}" width="{W}" height="{W}" fill="{SEA}"/>')
    ship_c = 6
    for r in range(N):
        for c in range(N):
            x, yy = c*C, by + r*C
            sea = r in (0, 12) or c in (0, 12)
            if sea: continue
            fill = PAR
            rr, cc = (r, c) if white else (12-r, 12-c)
            if (rr, cc) == (10, 6): fill = "#cfe8f0"
            if (rr, cc) == (9, 6): fill = "#b5d39a"
            if (rr, cc) == (1, 6): fill = "#9fcf8a"
            g.append(f'<rect x="{x+1.2:.1f}" y="{yy+1.2:.1f}" width="{C-2.4:.1f}" height="{C-2.4:.1f}" rx="3" fill="{fill}" stroke="{INK}" stroke-width="1.2"/>')
    # иконки открытых клеток (без подписей в клетке; бейдж в углу, не на иконке)
    R = (lambda r, c: (r, c)) if white else (lambda r, c: (12-r, 12-c))
    def icon(r, c, s):
        r, c = R(r, c)
        return t(c*C + C/2, by + r*C + C*0.68, s, 15, INK, anchor="middle")
    g.append(icon(10, 6, "❄") + icon(9, 6, "≈") + icon(1, 6, "♣"))
    jr, jc = R(1, 6)
    g.append(f'<circle cx="{jc*C+C-5:.1f}" cy="{by+jr*C+5:.1f}" r="5" fill="{GOLD}" stroke="{INK}"/>' + t(jc*C+C-5, by+jr*C+8, "3", 7, INK, "bold", "middle"))
    # корабли: свой — снизу (поле повёрнуто для активной команды), чужой — сверху
    for r, col, own in ((12, me, True), (0, foe, False)):
        x, yy = ship_c*C, by + r*C
        g.append(f'<rect x="{x+1:.1f}" y="{yy+1:.1f}" width="{C-2:.1f}" height="{C-2:.1f}" rx="4" fill="#6b4a2a" stroke="{GOLD if own else INK}" stroke-width="{3 if own else 1.5}"/>'
                 f'<path d="M{x+6:.1f} {yy+20:.1f} h{C-12:.1f} l-4 6 h{-(C-20):.1f} z" fill="{PAR}"/>'
                 f'<path d="M{x+C/2:.1f} {yy+5:.1f} v14 l8 -4 z" fill="{col}" stroke="{INK}" stroke-width=".8"/>')
    # цели хода выбранного пирата — пунктир (ничего поверх клеток)
    for (r, c) in ((11, 5), (11, 6), (11, 7), (12, 5), (12, 7)):
        g.append(f'<rect x="{c*C+2:.1f}" y="{by+r*C+2:.1f}" width="{C-4:.1f}" height="{C-4:.1f}" rx="3" fill="none" stroke="#3fe07a" stroke-width="2.5" stroke-dasharray="4 2"/>')
    # нижняя панель: 2 ряда с фиксированными слотами
    py = panel_top
    g.append(f'<rect y="{py}" width="{W}" height="{PANEL+BOT_INSET}" fill="#08303d"/>'
             f'<line x1="0" y1="{py}" x2="{W}" y2="{py}" stroke="{GOLD}" stroke-width="2"/>')
    # ряд 1: пираты (3 слота) + слот «Отмена»
    for i in range(3):
        x = 8 + i*86
        sel = i == 0
        g.append(f'<rect x="{x}" y="{py+8}" width="80" height="56" rx="10" fill="{GOLD if sel else PAR}" stroke="{INK}" stroke-width="{4 if sel else 2}"/>'
                 f'<circle cx="{x+24}" cy="{py+36}" r="15" fill="{me}" stroke="{INK}" stroke-width="2"/>' +
                 t(x+48, py+42, f"П{i+1}", 15, INK, "bold"))
        if sel: g.append(t(x+40, py+76, "▲ выбран", 10, GOLD, "bold", "middle"))
    g.append(f'<rect x="{8+3*86}" y="{py+8}" width="{W-16-3*86}" height="56" rx="10" fill="none" stroke="{PAR}" stroke-width="2" stroke-dasharray="5 3"/>' +
             t(8+3*86+(W-16-3*86)/2, py+41, "Отмена", 13, PAR, anchor="middle"))
    # ряд 2: действия — фиксированные слоты, неактивные приглушены
    acts = [("Корабль", True), ("Монета", False), ("Ром", False), ("Пропуск", True)]
    aw = (W - 16 - 3*6) / 4
    for i, (s, on) in enumerate(acts):
        x = 8 + i*(aw+6)
        g.append(f'<rect x="{x:.1f}" y="{py+82}" width="{aw:.1f}" height="46" rx="10" fill="{GOLD if on else "#3c5b63"}" stroke="{INK}" stroke-width="2"/>' +
                 t(x+aw/2, py+110, s, 13, INK if on else "#9ab", "bold", "middle"))
    g.append(f'<rect x="{W/2-60}" y="{H-9}" width="120" height="4" rx="2" fill="#cfe"/>')
    g.append('</g>')
    return "\n".join(g)

TW = 2*W + 3*40 + 480
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{TW}" height="{H+140}" viewBox="0 0 {TW} {H+140}">',
       f'<rect width="100%" height="100%" fill="{BG}"/>',
       t(40, 36, "Шакал — мобильная раскладка v2 (412×915): ничего не перекрывает поле", 22, PAR, "bold"),
       t(40+W/2, H+100, "Ход Белых — свой корабль снизу", 15, GOLD, "bold", "middle"),
       t(80+W*1.5, H+100, "Ход Чёрных — поле повёрнуто на 180°, свой корабль снизу", 15, GOLD, "bold", "middle"),
       phone(40, "w"), phone(80+W, "b")]
notes = ["Правила раскладки:",
 "1. Safe-area: сверху ровно env(safe-area-inset-top),",
 "   без двойного отступа со статус-баром.",
 "2. Верхняя панель 44px: ☰ · «Ход …» · счёт",
 "   с цветными точками ● 1 : ● 0 (16px bold).",
 "3. Лог — отдельный ряд 30px, не над полем.",
 "4. Карточка клетки над полем: иконка слева,",
 "   подпись и бейдж справа — не на иконке.",
 "5. Поле 13×13 целиком по ширине (≈31.7px",
 "   клетка), без обрезки и без пана; лишнее",
 "   место по высоте — поровну сверху/снизу.",
 "6. Оба корабля видны всегда; в режиме",
 "   «на одном устройстве» поле поворачивается",
 "   так, что корабль ходящего — снизу.",
 "7. Над полем нет плавающих кнопок/тостов.",
 "8. Нижняя панель: ряд пиратов (выбранный —",
 "   золотой, толстая рамка, «▲ выбран»)",
 "   + ряд действий в фиксированных слотах:",
 "   Корабль · Монета · Ром · Пропуск.",
 "   Неактивные — приглушены, не исчезают.",
 "9. Кнопки ≥ 44px; отступ снизу =",
 "   env(safe-area-inset-bottom).",
 "10. Цели хода — пунктир на самих клетках.",
 "Заменяет требование «fit to height» из #11."]
for i, s in enumerate(notes):
    svg.append(t(120+2*W+20, 110+i*26, s, 14, GOLD if i in (0, len(notes)-1) else PAR, "bold" if i in (0, len(notes)-1) else "normal"))
svg.append('</svg>')
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mobile-layout-v2")
open(out + ".svg", "w").write("\n".join(svg))
cairosvg.svg2png(url=out + ".svg", write_to=out + ".png", output_width=TW*2)
print("ok", out + ".png")
