# Spendly app icon: a coin split evenly in thirds, each a different shade of coral.
from PIL import Image, ImageDraw, ImageChops
import math, sys
OUTDIR=sys.argv[1]
S=4096  # draw big, then downscale for smooth edges
PALE=(248,223,217); INK=(43,36,32)
SHADES=[(244,185,166),(229,140,118),(192,98,76)]  # lighter, coral (theme), darker

def disc(cx,cy,r):
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).ellipse([cx-r,cy-r,cx+r,cy+r],fill=255); return m
def wedge(cx,cy,a0,a1):
    m=Image.new('L',(S,S),0); ImageDraw.Draw(m).pieslice([cx-2*S,cy-2*S,cx+2*S,cy+2*S],a0,a1,fill=255); return m

def coin(r, ridges=True, mono=False):
    """The coin on a transparent canvas. r is the radius as a fraction of the canvas."""
    r=r*S; spread=r*0.10; th=r*0.115
    # Centre the whole drawing (pieces spread out, the edge shows below).
    cx=S/2; cy=S/2-th/2
    im=Image.new('RGBA',(S,S),(0,0,0,0))
    for i,col in enumerate(SHADES):
        a0=-90+i*120; a1=a0+120; mid=math.radians((a0+a1)/2)
        dx,dy=math.cos(mid)*spread, math.sin(mid)*spread
        if mono:  # themed icons are flat: the three pieces with the rim cut out, nothing else
            rr=r*0.80
            piece=ImageChops.multiply(disc(cx+dx,cy+dy,r),wedge(cx+dx,cy+dy,a0,a1))
            ring=Image.new('L',(S,S),0)
            ImageDraw.Draw(ring).ellipse([cx+dx-rr,cy+dy-rr,cx+dx+rr,cy+dy+rr],outline=255,width=int(r*0.06))
            im.paste(Image.new('RGBA',(S,S),(255,255,255,255)),(0,0),ImageChops.subtract(piece,ring))
            continue
        edge=ImageChops.multiply(disc(cx+dx,cy+dy+th,r),wedge(cx+dx,cy+dy+th,a0,a1))
        im.paste(Image.new('RGBA',(S,S),INK+(255,)),(0,0),edge)
        face=Image.new('RGBA',(S,S),(255,255,255,255) if mono else col+(255,))
        fd=ImageDraw.Draw(face)
        detail=(0,0,0,0) if mono else PALE+(255,)
        rr=r*0.80; fd.ellipse([cx+dx-rr,cy+dy-rr,cx+dx+rr,cy+dy+rr],outline=detail,width=int(r*0.05))
        if ridges:
            for k in range(48):
                a=2*math.pi*k/48
                fd.line([cx+dx+math.cos(a)*r*0.88,cy+dy+math.sin(a)*r*0.88,cx+dx+math.cos(a)*r*0.97,cy+dy+math.sin(a)*r*0.97],fill=detail,width=int(r*0.025))
        fm=ImageChops.multiply(disc(cx+dx,cy+dy,r),wedge(cx+dx,cy+dy,a0,a1))
        if mono:  # cut the rim ring out of the silhouette
            ring=Image.new('L',(S,S),0); ImageDraw.Draw(ring).ellipse([cx+dx-rr,cy+dy-rr,cx+dx+rr,cy+dy+rr],outline=255,width=int(r*0.05))
            fm=ImageChops.subtract(fm,ring)
            im.paste(face,(0,0),fm)
        else:
            im.paste(face,(0,0),fm)
    return im

def save(img,size,name,mode):
    out=img.resize((size,size),Image.LANCZOS)
    if mode=='RGB':
        bg=Image.new('RGB',out.size,PALE); bg.paste(out,(0,0),out); out=bg
    out.save(f'{OUTDIR}/{name}')
    print(name,out.size,out.mode)

# iOS / default icon: pale coral square, coin filling ~70%.
save(coin(0.30),1024,'icon.png','RGB')
# Android adaptive: only the centre 66/108 is always visible, so keep the coin inside it.
save(coin(0.235),1024,'android-icon-foreground.png','RGBA')
Image.new('RGB',(1024,1024),PALE).save(f'{OUTDIR}/android-icon-background.png'); print('android-icon-background.png')
save(coin(0.235,mono=True),1024,'android-icon-monochrome.png','RGBA')
# Splash: the coin alone on transparent; the splash background is white.
save(coin(0.40),1024,'splash-icon.png','RGBA')
# Favicon: no ridges, which are noise at 48px.
save(coin(0.40,ridges=False),48,'favicon.png','RGBA')
