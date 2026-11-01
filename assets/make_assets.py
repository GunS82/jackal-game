# Генератор SVG-ассетов (Дизайнер). Стиль: старая карта.
import os
P='#efe0bb';E='#5a3b1e';
def tile(name,body,bg=P):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="8" fill="{bg}" stroke="{E}" stroke-width="3"/>{body}</svg>'
    open(f'tiles/{name}.svg','w').write(s)
def txt(t,y=58,sz=34,c=E): return f'<text x="50" y="{y}" font-family="Georgia,serif" font-size="{sz}" font-weight="bold" text-anchor="middle" fill="{c}">{t}</text>'
def S(c=E): return f'fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"'
st=S()
tile('closed',f'<path d="M50 85 Q48 60 52 40" {st}/><path d="M52 40 Q35 30 22 40 M52 40 Q66 28 80 38 M52 40 Q40 20 30 18 M52 40 Q62 20 74 20" {S("#2f6b3a")}/>',bg='#c9b27a')
tile('empty','<circle cx="30" cy="70" r="3" fill="#b59a66"/><circle cx="65" cy="35" r="2" fill="#b59a66"/>')
tile('sea','',bg='#3a9aa6')
tile('horse',f'<path d="M35 82 L38 55 Q30 45 38 30 L50 20 L52 30 Q68 34 66 50 L58 52 L62 82 Z" fill="{E}"/>')
for n,lab,col in [(2,'2','#2f6b3a'),(3,'3','#c08a2a'),(4,'4','#5d6b2f'),(5,'5','#6b6b6b')]:
    dots=''.join(f'<circle cx="{20+i*60/(n-1)}" cy="78" r="5" fill="{col}"/>' for i in range(n))
    tile(f'spin{n}',f'<path d="M50 50 m-22 0 a22 22 0 1 1 22 22" {S(col)}/>'+txt(lab,60,26,col)+dots)
tile('ice',f'<path d="M50 18 V82 M22 34 L78 66 M22 66 L78 34" {S("#2a7fa8")}/>',bg='#dff2f7')
tile('trap',f'<path d="M20 70 H80 M25 70 L32 45 L40 70 L48 45 L56 70 L64 45 L72 70" {st}/><circle cx="50" cy="35" r="8" {st}/>')
tile('croc',f'<path d="M15 55 Q40 35 85 45 L85 52 L40 58 L85 62 L85 68 Q40 75 15 60 Z" fill="#3c7a3a" stroke="{E}" stroke-width="3"/><circle cx="35" cy="47" r="3" fill="{E}"/>')
tile('ogre',f'<circle cx="50" cy="48" r="26" fill="#b5523a" stroke="{E}" stroke-width="3"/><path d="M38 40 h6 M56 40 h6" {st}/><path d="M36 60 L42 54 L48 60 L54 54 L60 60 L64 56" {st}/>')
tile('fort',f'<path d="M22 82 V40 H32 V32 H42 V40 H58 V32 H68 V40 H78 V82 Z" fill="#b8a07a" stroke="{E}" stroke-width="3"/><path d="M44 82 V62 Q50 54 56 62 V82" fill="{E}"/>')
tile('abor',f'<path d="M22 82 V40 H32 V32 H42 V40 H58 V32 H68 V40 H78 V82 Z" fill="#d79b6b" stroke="{E}" stroke-width="3"/><path d="M50 52 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 Z" fill="#c0392b"/>')
R=['I','II','III','IV','V']
for i in range(1,6):
    tile(f'chest{i}',f'<rect x="22" y="40" width="56" height="34" rx="4" fill="#8a5a2b" stroke="{E}" stroke-width="3"/><path d="M22 48 H78" stroke="#d4a017" stroke-width="4"/>'+txt(R[i-1],32,20))
tile('plane',f'<path d="M50 15 L56 45 L85 55 L85 60 L56 56 L54 75 L64 82 L36 82 L46 75 L44 56 L15 60 L15 55 L44 45 Z" fill="{E}"/>')
tile('balloon',f'<ellipse cx="50" cy="40" rx="22" ry="26" fill="#c0392b" stroke="{E}" stroke-width="3"/><path d="M38 62 L44 74 M62 62 L56 74" {st}/><rect x="42" y="74" width="16" height="10" fill="#8a5a2b"/>')
tile('cannon',f'<path d="M20 55 L70 35 L76 48 L26 66 Z" fill="#444" stroke="{E}" stroke-width="3"/><circle cx="35" cy="70" r="12" fill="#8a5a2b" stroke="{E}" stroke-width="3"/>')
tile('barrel',f'<path d="M32 22 Q24 50 32 78 H68 Q76 50 68 22 Z" fill="#a0692f" stroke="{E}" stroke-width="3"/><path d="M28 38 H72 M28 62 H72" stroke="{E}" stroke-width="3"/>')
for i in range(1,4):
    b=''.join(f'<g transform="translate({(i-1)*-11+j*22} 0)"><path d="M46 80 V48 Q46 40 50 36 V22 H54 V36 Q58 40 58 48 V80 Z" fill="#3d6b35" stroke="{E}" stroke-width="2"/></g>' for j in range(i))
    tile(f'rum{i}',b)
# фишки
cols={'white':'#f5f5f0','yellow':'#e8c33a','black':'#2b2b2b','red':'#c0392b'}
for c,v in cols.items():
    open(f'pieces/pirate-{c}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="{v}" stroke="{E}" stroke-width="5"/><path d="M28 44 Q50 22 72 44 Z" fill="{E}"/><circle cx="50" cy="58" r="10" fill="#e8c9a0" stroke="{E}" stroke-width="3"/></svg>')
    open(f'pieces/ship-{c}.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M15 62 H85 L74 82 H26 Z" fill="#8a5a2b" stroke="{E}" stroke-width="3"/><path d="M50 15 V62" stroke="{E}" stroke-width="4"/><path d="M53 18 L80 55 H53 Z" fill="{v}" stroke="{E}" stroke-width="3"/><path d="M47 24 L24 55 H47 Z" fill="{v}" stroke="{E}" stroke-width="3"/></svg>')
open('pieces/coin.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="#e3b23c" stroke="#7a5a12" stroke-width="5"/><circle cx="50" cy="50" r="26" fill="none" stroke="#7a5a12" stroke-width="3"/><text x="50" y="62" font-family="Georgia,serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#7a5a12">$</text></svg>')
# Стрелки: направления как в src/game.js (y вниз). Базовый поворот задаётся в коде.
ARR={'arrow1':[(0,-1)],'arrow1d':[(1,-1)],'arrow2':[(0,-1),(0,1)],'arrow2d':[(1,-1),(-1,1)],
 'arrow3':[(-1,-1),(1,0),(0,1)],'arrow4':[(0,-1),(1,0),(0,1),(-1,0)],'arrow4d':[(1,-1),(1,1),(-1,1),(-1,-1)]}
import math
for n,ds in ARR.items():
    b=f'<circle cx="50" cy="50" r="5" fill="{E}"/>'
    for dx,dy in ds:
        a=math.degrees(math.atan2(dx,-dy))
        L=36 if dx and dy else 34
        b+=f'<g transform="rotate({a} 50 50)"><path d="M50 50 V{50-L} M40 {60-L} L50 {50-L} L60 {60-L}" {st}/></g>'
    tile(n,b)
