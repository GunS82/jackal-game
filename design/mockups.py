# Макеты экранов подключения (Дизайнер). Телефон 360x640.
E='#5a3b1e';P='#efe0bb';SEA='#2f8794';G='#e3b23c'
def btn(y,t,primary=True,sub=''):
    f=G if primary else P
    s=f'<rect x="40" y="{y}" width="280" height="56" rx="14" fill="{f}" stroke="{E}" stroke-width="3"/><text x="180" y="{y+ (26 if sub else 36)}" font-family="DejaVu Serif" font-size="20" font-weight="bold" text-anchor="middle" fill="{E}">{t}</text>'
    if sub: s+=f'<text x="180" y="{y+46}" font-family="DejaVu Sans" font-size="12" text-anchor="middle" fill="{E}">{sub}</text>'
    return s
def screen(title,body):
    return f'<rect width="360" height="640" rx="24" fill="{SEA}"/><rect x="16" y="70" width="328" height="550" rx="16" fill="{P}" stroke="{E}" stroke-width="3"/><text x="180" y="48" font-family="DejaVu Serif" font-size="26" font-weight="bold" text-anchor="middle" fill="#f3ead2">{title}</text>{body}'
def txt(y,t,sz=16,w='normal'): return f'<text x="180" y="{y}" font-family="DejaVu Sans" font-size="{sz}" font-weight="{w}" text-anchor="middle" fill="{E}">{t}</text>'
ship='<g transform="translate(130 95) scale(1)"><path d="M15 66 H85 L74 84 H26 Z" fill="#c8a06a" stroke="#2a1a0a" stroke-width="3"/><path d="M50 12 V66" stroke="#2a1a0a" stroke-width="4"/><path d="M53 16 L80 58 H53 Z" fill="#fff" stroke="#2a1a0a" stroke-width="3"/><path d="M47 22 L24 58 H47 Z" fill="#fff" stroke="#2a1a0a" stroke-width="3"/></g>'
s1=screen('Шакал',ship+txt(215,'Остров сокровищ',18,'bold')+btn(250,'Играть онлайн',True,'через сервер, с другом по коду')+btn(326,'Играть рядом',True,'Bluetooth, без интернета')+btn(402,'За одним экраном',False)+btn(478,'Правила',False)+btn(554,'Настройки',False))
code=''.join(f'<rect x="{58+i*62}" y="150" width="50" height="64" rx="8" fill="#fff" stroke="{E}" stroke-width="3"/><text x="{83+i*62}" y="195" font-family="DejaVu Sans" font-size="32" font-weight="bold" text-anchor="middle" fill="{E}">{c}</text>' for i,c in enumerate('K7QM'))
s2=screen('Онлайн',txt(120,'Код вашей игры',16,'bold')+code+txt(245,'Передайте код другу',14)+btn(265,'Поделиться кодом',False)+f'<path d="M40 350 H320" stroke="{E}" stroke-dasharray="6 6"/>'+txt(385,'Есть код друга?',16,'bold')+f'<rect x="40" y="400" width="280" height="52" rx="10" fill="#fff" stroke="{E}" stroke-width="3"/><text x="60" y="433" font-family="DejaVu Sans" font-size="18" fill="#a08a6a">Введите код</text>'+btn(470,'Войти в игру')+txt(590,'Ждём соперника…',15))
dev=lambda y,n,s:f'<rect x="40" y="{y}" width="280" height="54" rx="10" fill="#fff" stroke="{E}" stroke-width="2"/><text x="60" y="{y+24}" font-family="DejaVu Sans" font-size="17" font-weight="bold" fill="{E}">{n}</text><text x="60" y="{y+44}" font-family="DejaVu Sans" font-size="12" fill="#7a6a55">{s}</text>'
s3=screen('Игра рядом',btn(95,'Создать игру',True,'этот телефон ждёт')+txt(190,'или подключитесь к найденному:',14,'bold')+dev(205,'Телефон Геннадия','ждёт игрока · коснитесь, чтобы войти')+dev(270,'Pixel 7','ждёт игрока')+txt(360,'Ищем телефоны рядом…',15)+txt(400,'Включите Bluetooth на обоих',13)+txt(420,'телефонах и держите их рядом',13))
def bar(y,ico,t,sub,col):
    return f'<rect x="32" y="{y}" width="296" height="88" rx="12" fill="{col}" stroke="{E}" stroke-width="3"/><text x="56" y="{y+52}" font-size="30" font-family="DejaVu Sans" font-weight="bold" fill="#5a3b1e">{ico}</text><text x="100" y="{y+38}" font-family="DejaVu Sans" font-size="17" font-weight="bold" fill="{E}">{t}</text><text x="100" y="{y+62}" font-family="DejaVu Sans" font-size="13" fill="{E}">{sub}</text>'
s4=screen('Во время партии',txt(110,'Плашка над полем:',14,'bold')+bar(125,'…','Ход соперника','Чёрные думают · 0:42','#f7efd9')+bar(225,'!','Связь потеряна','Переподключаемся… 3 c','#f6d7a7')+bar(325,'×','Соперник вышел','Ждать 2 мин · Завершить','#f2b8a8')+bar(425,'★','Ваш ход!','Вибрация и звук колокола','#cfe6b8')+txt(560,'Поле при этом остаётся видно,',13)+txt(580,'плашка не закрывает игру',13))
W=375*4+20
out=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="680"><rect width="{W}" height="680" fill="#1d3640"/>'
for i,s in enumerate([s1,s2,s3,s4]): out+=f'<g transform="translate({20+i*375} 20)">{s}</g>'
open('connect-screens.svg','w').write(out+'</svg>')
