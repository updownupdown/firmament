# Fit mean orbital elements of the moons of Mars, Saturn and Uranus to PyEphem 4.2
# (pip install ephem numpy scipy), 2000-2038. Output: moons.json, pasted into
# src/astro/satellites.ts. See the header of that file.
import ephem, math, json, sys
import numpy as np
from scipy.optimize import least_squares
DEG=math.pi/180
C_AU_DAY=173.144632674
J2000=2451545.0
DJD=2415020.0  # ephem dates are days since 1899 Dec 31.5
P={'mars':(317.269,54.432,3396.2),'saturn':(40.589,83.537,60268.0),'uranus':(257.311,-15.175,25559.0)}
MOONS=[('phobos',ephem.Phobos,'mars',0.31891),('deimos',ephem.Deimos,'mars',1.26244),
 ('mimas',ephem.Mimas,'saturn',0.942422),('enceladus',ephem.Enceladus,'saturn',1.370218),('tethys',ephem.Tethys,'saturn',1.887802),
 ('dione',ephem.Dione,'saturn',2.736915),('rhea',ephem.Rhea,'saturn',4.517500),('titan',ephem.Titan,'saturn',15.945421),
 ('hyperion',ephem.Hyperion,'saturn',21.276609),('iapetus',ephem.Iapetus,'saturn',79.330183),
 ('miranda',ephem.Miranda,'uranus',1.413479),('ariel',ephem.Ariel,'uranus',2.520379),('umbriel',ephem.Umbriel,'uranus',4.144177),
 ('titania',ephem.Titania,'uranus',8.705872),('oberon',ephem.Oberon,'uranus',13.463239)]
def sph(ra,dec): return np.array([math.cos(dec)*math.cos(ra),math.cos(dec)*math.sin(ra),math.sin(dec)])
def basis(pole):
    # node of planet equator on the J2000 equator: x along node, z pole
    z=pole; x=np.cross([0,0,1],z); x/=np.linalg.norm(x); y=np.cross(z,x); return np.array([x,y,z])
LIB={'mimas':70.56*365.25,'tethys':70.56*365.25,'hyperion':640.0,'enceladus':3.89*365.25,'dione':3.89*365.25}
def model(p,t):
    a,e,inc,O0,Od,w0,wd,L0,n,A,k,ph,q=p
    O=O0+Od*t; w=w0+wd*t; L=L0+n*t+q*1e-9*t*t+A*np.sin(k*t+ph)
    M=L-w
    E=M.copy()
    for _ in range(8): E=E-(E-e*np.sin(E)-M)/(1-e*np.cos(E))
    xv=a*(np.cos(E)-e); yv=a*math.sqrt(max(0,1-e*e))*np.sin(E)
    om=w-O  # argument of pericentre
    co,so=np.cos(O),np.sin(O); cw,sw=np.cos(om),np.sin(om); ci,si=math.cos(inc),math.sin(inc)
    X=(co*cw-so*sw*ci)*xv+(-co*sw-so*cw*ci)*yv
    Y=(so*cw+co*sw*ci)*xv+(-so*sw+co*cw*ci)*yv
    Z=(sw*si)*xv+(cw*si)*yv
    return np.stack([X,Y,Z],1)
out={}
def run(item):
    mid,cls,par,per=item
    out={}
    if True:
        pra,pde,R=P[par]; B=basis(sph(pra*DEG,pde*DEG))
        pl=getattr(ephem,par.capitalize())()
        ts=[];vs=[]
        step=max(per*0.37+0.013, 38*365.25/2000)
        jd=2451545.0
        end=2451545+38*365.25
        while jd<end:
            d=ephem.Date(jd-DJD); m=cls(); m.compute(d); pl.compute(d)
            if m.x==0 and m.y==0 and m.z==0: jd+=step; continue
            ra,dec=float(pl.a_ra),float(pl.a_dec)
            u=sph(ra,dec); east=np.array([-math.sin(ra),math.cos(ra),0]); north=np.cross(u,east)
            v=R*(m.x*east - m.y*north - m.z*u)  # km, J2000
            ts.append(jd - pl.earth_distance/C_AU_DAY - J2000); vs.append(B@v)
            jd+=step
        t=np.array(ts); V=np.array(vs)
        r=np.linalg.norm(V,axis=1); a0=r.mean()
        n0=2*math.pi/per
        L0=math.atan2(V[0,1],V[0,0])-n0*t[0]
        # coarse search for n
        Nn=np.cross(V[:-1],V[1:]); Nn=Nn[np.linalg.norm(Nn,axis=1)>0]
        nrm=(Nn/np.linalg.norm(Nn,axis=1)[:,None]).mean(0); nrm/=np.linalg.norm(nrm)
        inc0=math.acos(nrm[2]); O0=math.atan2(nrm[0],-nrm[1])
        # mean longitude: node angle plus in-plane angle
        xn=np.array([math.cos(O0),math.sin(O0),0.0]); yn=np.cross(nrm,xn)
        u=np.unwrap(np.arctan2(V@yn,V@xn))
        A_=np.vstack([t,np.ones_like(t)]).T; nn,u0=np.linalg.lstsq(A_,u,rcond=None)[0]
        L0g=O0+u0
        kl=2*math.pi/LIB.get(mid,1e9)
        lam=1.0 if mid in LIB else 1e-12
        f=lambda p: (model(p,t)-V).ravel()/a0
        best=None
        for ph0 in ([0,2,4] if mid in LIB else [0]):
          for wo in [0,1.6,3.2,4.8]:
           for e0 in [0.002,0.03]:
            p0=[a0,e0,inc0,O0,0,O0+wo,0,L0g,nn,0.01 if mid in LIB else 0,kl,ph0,0]
            lo=[0.8*a0,0,0,-50,-0.01,-50,-0.05,-1e4,nn*0.99,-lam,kl*0.9-1e-12,-50,-100]; hi=[1.2*a0,0.4,math.pi,50,0.01,50,0.05,1e4,nn*1.01,lam,kl*1.1+1e-12,50,100]
            s_=least_squares(f,p0,bounds=(lo,hi),x_scale='jac',max_nfev=4000)
            if best is None or s_.cost<best.cost: best=s_
        p=best.x; res=np.sqrt(np.mean(np.sum((model(p,t)-V)**2,1)))
        a,e,inc,O0,Od,w0,wd,L0,n,A,k,ph,q=p
        out[mid]=dict(parent=par,a=round(a,1),e=round(e,6),i=round(inc/DEG,4),node=round((O0/DEG)%360,4),nodeRate=Od/DEG*365.25,
            peri=round((w0/DEG)%360,4),periRate=wd/DEG*365.25,L=round((L0/DEG)%360,5),n=n/DEG,q=q*1e-9/DEG,lib=[A/DEG,k/DEG,ph/DEG],rmsKm=round(res,1),N=len(t),rmsFrac=res/a)
        print(mid,{k:out[mid][k] for k in ['a','e','i','rmsKm','rmsFrac','N']},file=sys.stderr)

    return out
import multiprocessing as mp
if __name__=='__main__':
    allo={}
    with mp.Pool(4) as pool:
        for o in pool.imap_unordered(run,MOONS): allo.update(o)
    json.dump(allo,open('/tmp/claude-0/fit/moons.json','w'),indent=1)
