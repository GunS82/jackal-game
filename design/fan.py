import re
A='/workspace/jackal-game/assets/'
def inner(p): return re.sub(r'^<svg[^>]*>|</svg>$','',open(A+p).read())
def use(p,x,y,s): return f'<svg x="{x}" y="{y}" width="{s}" height="{s}" viewBox="0 0 100 100">{inner(p)}</svg>'
E='#5a3b1e'
def num(x,y,n,r=11): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="{E}" stroke-width="2.5"/><text x="{x}" y="{y+5}" font-family="DejaVu Sans" font-weight="bold" font-size="{r*1.3}" text-anchor="middle" fill="{E}">{n}</text>'
W,H=420,640
o=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#2f8794"/>'
# панели
def panel(x,name,col,score,sel=None,active=False):
    s=f'<rect x="{x}" y="10" width="195" height="92" rx="12" fill="#efe0bb" stroke="{"#e3b23c" if active else E}" stroke-width="{5 if active else 3}"/><text x="{x+14}" y="36" font-family="DejaVu Serif" font-weight="bold" font-size="17" fill="{E}">{name}</text>'
    s+=use('pieces/coin.svg',x+140,16,26)+f'<text x="{x+172}" y="36" font-family="DejaVu Sans" font-weight="bold" font-size="17" fill="{E}">{score}</text>'
    for i in range(3):
        cx=x+20+i*58
        if sel==i+1: s+=f'<circle cx="{cx+21}" cy="{67}" r="27" fill="none" stroke="#3fbf5a" stroke-width="5"/>'
        s+=use(f'pieces/pirate-{col}.svg',cx,46,42)+num(cx+38,52,i+1,9)
    return s
o+=panel(8,'Вы',"white",'2',sel=2,active=True)+panel(217,'Соперник','black','1')
# поле
cs=56;ox=14;oy=130
for r in range(8):
    for c in range(7):
        t='closed.svg' if (r,c) not in [(5,3),(4,3),(4,2),(3,4)] else 'empty.svg'
        if r==7: o+=f'<rect x="{ox+c*cs}" y="{oy+r*cs}" width="{cs}" height="{cs}" fill="#2f8794"/>'; continue
        o+=use('tiles/'+t,ox+c*cs,oy+r*cs,cs)
o+=use('pieces/ship-white.svg',ox+3*cs,oy+7*cs,cs)
# подсветка ходов для пирата 2
for (r,c) in [(6,2),(6,3),(6,4)]: o+=use('../assets/ui/hl-move.svg'.replace('../assets/',''),ox+c*cs,oy+r*cs,cs)
# веер: в море рядом с кораблём, не закрывает поле
by=oy+7*cs
o+=f'<rect x="{ox+2}" y="{by+4}" width="{2.9*cs}" height="{cs-8}" rx="24" fill="#efe0bb" stroke="{E}" stroke-width="3"/><path d="M{ox+2.9*cs} {by+20} L{ox+3*cs+4} {by+cs/2} L{ox+2.9*cs} {by+cs-20}" fill="#efe0bb" stroke="{E}" stroke-width="3"/>'
for i in range(3):
    px=ox+10+i*52;py=by+7
    if i==1: o+=f'<circle cx="{px+21}" cy="{py+21}" r="25" fill="none" stroke="#3fbf5a" stroke-width="5"/>'
    o+=use('pieces/pirate-white.svg',px,py,42)+num(px+38,py+6,i+1,9)
o+=f'<rect x="10" y="590" width="400" height="40" rx="10" fill="#cfe6b8" stroke="{E}" stroke-width="2"/><text x="210" y="616" font-family="DejaVu Sans" font-size="15" font-weight="bold" text-anchor="middle" fill="{E}">Ваш ход: выбран пират 2, выберите клетку</text>'
open('fan.svg','w').write(o+'</svg>')
