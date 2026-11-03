import cairosvg
W,H=360,780
P='#efe0bb';E='#5a3b1e';S='#2f8794';G='#e3b23c';BG='#0d4a5e'
def frame(menu):
    o=f'<rect width="{W}" height="{H}" fill="{BG}"/>'
    # верхняя полоса 44px
    o+=f'<rect x="8" y="8" width="36" height="36" rx="8" fill="{P}" stroke="{E}" stroke-width="2"/>'
    for y in (19,26,33): o+=f'<rect x="16" y="{y}" width="20" height="3" fill="{E}"/>'
    o+=f'<rect x="52" y="8" width="300" height="36" rx="18" fill="{P}" stroke="{G}" stroke-width="3"/>'
    o+=f'<circle cx="70" cy="26" r="7" fill="#fff" stroke="{E}" stroke-width="1.5"/><text x="84" y="31" font-family="DejaVu Sans" font-size="14" font-weight="bold" fill="{E}">Ход Белых · №1</text>'
    o+=f'<text x="340" y="31" text-anchor="end" font-family="DejaVu Sans" font-size="13" fill="{E}">Б 0 : 0 Ч</text>'
    # поле
    top=52;cs=W/13;bh=13*cs
    o+=f'<rect x="0" y="{top}" width="{W}" height="{bh}" fill="{S}"/>'
    for r in range(13):
        for c in range(13):
            if r in(0,12) or c in(0,12): continue
            if (r,c) in [(1,1),(1,11),(11,1),(11,11)]: continue
            o+=f'<rect x="{c*cs+1}" y="{top+r*cs+1}" width="{cs-2}" height="{cs-2}" rx="3" fill="#b8a170" stroke="{E}" stroke-width="1"/>'
    for (r,col) in [(0,'#222'),(12,'#fff')]:
        o+=f'<rect x="{6*cs+1}" y="{top+r*cs+1}" width="{cs-2}" height="{cs-2}" fill="#c8a06a" stroke="{E}"/><circle cx="{6.5*cs}" cy="{top+(r+.5)*cs}" r="8" fill="{col}" stroke="{E}"/>'
        o+=f'<circle cx="{6.5*cs+10}" cy="{top+r*cs+6}" r="7" fill="#fff" stroke="{E}"/><text x="{6.5*cs+10}" y="{top+r*cs+10}" text-anchor="middle" font-family="DejaVu Sans" font-size="8" font-weight="bold" fill="{E}">×3</text>'
    # контекстная кнопка поверх поля у корабля
    by=top+11*cs-6
    o+=f'<rect x="{6*cs}" y="{by}" width="134" height="30" rx="15" fill="{G}" stroke="{E}" stroke-width="2"/><text x="{6*cs+67}" y="{by+20}" text-anchor="middle" font-family="DejaVu Sans" font-size="12" font-weight="bold" fill="{E}">Плыть кораблём</text>'
    # нижняя панель
    py=H-110
    o+=f'<text x="12" y="{py+14}" font-family="DejaVu Sans" font-size="12" fill="#b9c7cc">№1 ● Пират 2 нашёл монету</text>'
    py+=26
    o+=f'<rect x="8" y="{py}" width="{W-16}" height="64" rx="12" fill="{P}" stroke="{E}" stroke-width="2"/>'
    for i in range(3):
        x=24+i*52
        o+=f'<circle cx="{x+18}" cy="{py+32}" r="18" fill="#fff" stroke="{"#3fbf5a" if i==1 else E}" stroke-width="{4 if i==1 else 2}"/><text x="{x+18}" y="{py+37}" text-anchor="middle" font-family="DejaVu Sans" font-size="14" font-weight="bold" fill="{E}">{i+1}</text>'
    acts=[('Монета',True),('Ром',False)]
    for j,(t,on) in enumerate(acts):
        x=190+j*80
        o+=f'<rect x="{x}" y="{py+12}" width="72" height="40" rx="10" fill="{G if on else "#d8cba8"}" stroke="{E}" stroke-width="1.5" opacity="{1 if on else .5}"/><text x="{x+36}" y="{py+37}" text-anchor="middle" font-family="DejaVu Sans" font-size="12" font-weight="bold" fill="{E}">{t}</text>'
    if menu:
        o+=f'<rect width="{W}" height="{H}" fill="#000" opacity=".45"/><rect x="0" y="0" width="250" height="{H}" fill="{P}" stroke="{E}" stroke-width="2"/>'
        o+=f'<text x="20" y="40" font-family="DejaVu Serif" font-size="22" font-weight="bold" fill="{E}">Шакал</text>'
        items=['Продолжить','Новая игра','Сохранить партию','Загрузить позицию','Это устройство: оба игрока','Масштаб поля: вписать','Правила и как играть','Счёт и статистика','Выйти из онлайн-игры']
        for k,t in enumerate(items):
            y=70+k*52
            o+=f'<line x1="16" y1="{y+44}" x2="234" y2="{y+44}" stroke="{E}" stroke-opacity=".25"/><text x="20" y="{y+28}" font-family="DejaVu Sans" font-size="14" fill="{E}">{t}</text>'
    return o
o=f'<svg xmlns="http://www.w3.org/2000/svg" width="{2*W+40}" height="{H+40}"><rect width="100%" height="100%" fill="#ddd"/>'
o+=f'<g transform="translate(10 30)">{frame(False)}</g><g transform="translate({W+30} 30)">{frame(True)}</g>'
o+=f'<text x="10" y="20" font-family="DejaVu Sans" font-size="14">Игра</text><text x="{W+30}" y="20" font-family="DejaVu Sans" font-size="14">Меню ☰</text></svg>'
open('design/mobile-layout.svg','w').write(o)
cairosvg.svg2png(bytestring=o.encode(),write_to='design/mobile-layout.png',scale=2)
