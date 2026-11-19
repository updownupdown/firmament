# Fit mean orbital elements (in the parent's equator frame, node from the J2000 equator) to
# JPL Horizons state vectors: python fit_horizons.py <moon id> <vec file> <parent> [q]
import sys, math, json
import numpy as np
from scipy.optimize import least_squares
DEG=math.pi/180; J2000=2451545.0
POLE={'jupiter':(268.056595,64.495303),'saturn':(40.589,83.537),'uranus':(257.311,-15.175),'neptune':(299.36,43.46),'pluto':(132.993,-6.163)}
GM={'jupiter':126686534.0,'saturn':37931187.0,'uranus':5793939.0,'neptune':6836529.0,'pluto':975.5}
def sph(ra,dec): return np.array([math.cos(dec)*math.cos(ra),math.cos(dec)*math.sin(ra),math.sin(dec)])
def basis(par):
    z=sph(POLE[par][0]*DEG,POLE[par][1]*DEG); x=np.array([-z[1],z[0],0.0]); x/=np.linalg.norm(x); y=np.cross(z,x); return np.array([x,y,z])
def read(path):
    t=[];V=[];W=[]
    on=False
    for line in open(path):
        if line.startswith('$$SOE'): on=True; continue
        if line.startswith('$$EOE'): break
        if on:
            f=[s.strip() for s in line.split(',')]
            t.append(float(f[0])-J2000); V.append([float(x) for x in f[2:5]]); W.append([float(x) for x in f[5:8]])
    return np.array(t),np.array(V),np.array(W)
def model(p,t):
    a,e,inc,O0,Od,w0,wd,L0,n=p
    O=O0+Od*t; w=w0+wd*t; M=L0+n*t-w
    E=M.copy()
    for _ in range(30): E=E-(E-e*np.sin(E)-M)/(1-e*np.cos(E))
    xv=a*(np.cos(E)-e); yv=a*math.sqrt(1-e*e)*np.sin(E)
    om=w-O; co,so=np.cos(O),np.sin(O); cw,sw=np.cos(om),np.sin(om); ci,si=math.cos(inc),math.sin(inc)
    X=(co*cw-so*sw*ci)*xv+(-co*sw-so*cw*ci)*yv
    Y=(so*cw+co*sw*ci)*xv+(-so*sw+co*cw*ci)*yv
    Z=(sw*si)*xv+(cw*si)*yv
    return np.stack([X,Y,Z],1)
def osc(r,v,mu):
    h=np.cross(r,v); rn=np.linalg.norm(r); vn=np.linalg.norm(v)
    ev=np.cross(v,h)/mu-r/rn; e=np.linalg.norm(ev)
    a=1/(2/rn-vn*vn/mu); inc=math.acos(h[2]/np.linalg.norm(h))
    O=math.atan2(h[0],-h[1]); nvec=np.array([math.cos(O),math.sin(O),0])
    om=math.atan2(np.dot(np.cross(nvec,ev),h)/np.linalg.norm(h),np.dot(nvec,ev))
    nu=math.atan2(np.dot(np.cross(ev,r),h)/np.linalg.norm(h),np.dot(ev,r))
    E=2*math.atan(math.sqrt((1-e)/(1+e))*math.tan(nu/2)); M=E-e*math.sin(E)
    n=math.sqrt(mu/a**3)*86400
    return a,e,inc,O,O+om,O+om+M,n
mid,path,par=sys.argv[1:4]; q=float(sys.argv[4]) if len(sys.argv)>4 else 0
t,V,W=read(path); B=basis(par); tm=round(float(t.mean())); t=t-tm
V=V@B.T; W=W@B.T
if q:  # Pluto's moons circle the Pluto–Charon barycentre: remove Pluto's own wobble using Charon's mean orbit
    Lc=(304.18136+56.36272545*(t+tm))*DEG
    C=19596*np.stack([np.cos(Lc),np.sin(Lc),0*t],1)  # already in Pluto's equator frame (Charon: i=0, node 0)
    V=V-q*C   # moon from barycentre = moon from Pluto + Pluto from barycentre (-q*C)
a,e,inc,O,w,L,n=osc(V[0],W[0],GM[par]*(1 if not q else 1))
# phase-unwrap: estimate n from in-plane angle
nrm=np.cross(V[0],W[0]); nrm/=np.linalg.norm(nrm)
xn=np.array([math.cos(O),math.sin(O),0.0]); yn=np.cross(nrm,xn)
u=np.unwrap(np.arctan2(V@yn,V@xn)); nfit=np.polyfit(t,u,1)[0]
L0=O+np.polyfit(t,u,1)[1]
a0=np.linalg.norm(V,axis=1).mean()
f=lambda p:(model(p,t)-V).ravel()/a0
best=None
for wo in np.linspace(0,2*math.pi,8,endpoint=False):
    for e0 in ([e] if e>0.05 else [e,0.002,0.01]):
        p0=[a0 if e<0.1 else a,e0,inc,O,0,w+wo,0,L0,nfit]
        s=least_squares(f,p0,x_scale='jac',max_nfev=3000,bounds=([0.5*a0,0,0,-60,-1,-60,-1,-1e5,nfit*0.95],[2*a0,0.95,math.pi,60,1,60,1,1e5,nfit*1.05]))
        if best is None or s.cost<best.cost: best=s
p=best.x.copy(); res=np.sqrt(np.mean(np.sum((model(p,t)-V)**2,1)))
a,e,inc,O0,Od,w0,wd,L0,n=p
O0-=Od*tm; w0-=wd*tm; L0-=n*tm
md=lambda x:x%360
out=dict(id=mid,a=round(a,1),e=round(e,6),i=round(inc/DEG,4),node=round(md(O0/DEG),4),nodeRate=round(Od/DEG*365.25,5),peri=round(md(w0/DEG),4),periRate=round(wd/DEG*365.25,5),L=round(md(L0/DEG),5),n=round(n/DEG,8),rms=round(100*res/a,2),span=[float(t[0]+tm),float(t[-1]+tm)])
print(json.dumps(out))
