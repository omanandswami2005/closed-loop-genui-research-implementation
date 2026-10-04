"""Regenerate the paper's result charts from results/ (needs matplotlib)."""
import csv, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pathlib
R=str(pathlib.Path(__file__).resolve().parents[2])+'/'
O=R+'paper/figures/'
plt.rcParams.update({'font.family':'serif','font.serif':['STIXGeneral','DejaVu Serif'],'mathtext.fontset':'stix',
 'font.size':8,'axes.linewidth':0.6,'xtick.major.width':0.6,'ytick.major.width':0.6,'axes.spines.top':False,'axes.spines.right':False,
 'pdf.fonttype':42})
rows={r['variant']:r for r in csv.DictReader(open(R+'results/benchmark/summary.csv')) if r['archetype']=='all'}
arms=[('static','Static'),('unconstrained_genui','Unconstr.'),('rule_based','Rule-based'),('closed_loop','Closed loop')]
fig,axs=plt.subplots(1,3,figsize=(3.5,1.15),sharey=True)
y=list(range(len(arms)))[::-1]
panels=[('mean_delta_m_ref','Constraint error $\\Delta M$',True),('jitter','Jitter $J$',True),('level_skips_per_run','Level skips per run',False)]
for ax,(k,t,ci) in zip(axs,panels):
    v=[float(rows[a][k]) for a,_ in arms]
    cols=['#9a9a9a']*3+['#222222']
    if ci:
        lo=[v[i]-float(rows[a][k+'_ci_lo']) for i,(a,_) in enumerate(arms)]
        hi=[float(rows[a][k+'_ci_hi'])-v[i] for i,(a,_) in enumerate(arms)]
        ax.barh(y,v,height=0.62,color=cols,xerr=[lo,hi],error_kw={'elinewidth':0.6,'capsize':1.5})
    else:
        ax.barh(y,v,height=0.62,color=cols)
    m=max(v)
    for yi,vi in zip(y,v):
        ax.text(vi+m*0.04,yi,f'{vi:.3f}' if ci else f'{vi:.2f}',va='center',fontsize=6.5)
    ax.set_xlim(0,m*1.55); ax.set_title(t,fontsize=7.5,pad=3)
    ax.tick_params(axis='x',labelsize=6.5); ax.xaxis.grid(True,lw=0.3,color='#dddddd'); ax.set_axisbelow(True)
    ax.tick_params(axis='y',length=0)
axs[0].set_yticks(y); axs[0].set_yticklabels([n for _,n in arms],fontsize=7)
fig.tight_layout(pad=0.3,w_pad=0.6)
fig.savefig(O+'results.pdf')

# probe
P={}
for r in csv.DictReader(open(R+'results/benchmark/probe_steps.csv')):
    if r['probe']=='saturated_lapse': P.setdefault(r['variant'],[]).append(r)
fig,ax=plt.subplots(figsize=(3.5,1.05))
err=[int(r['step']) for r in P['closed_loop'] if r['correct']=='0']
ax.axvspan(min(err)-0.5,max(err)+0.5,color='#e6e6e6',lw=0)
ax.text((min(err)+max(err))/2,1.02,'5 errors',ha='center',va='bottom',fontsize=6.5)
for v,lab,ls,mk,c,lw in [('closed_loop','Plain BKT','-',None,'#a0a0a0',2.4),('closed_loop_lapse_cusum','CUSUM lapse detector','--','o','#111111',1.0),('closed_loop_forgetting','Forgetting $P(F)=0.02$',':','s','#111111',1.0)]:
    s=[int(r['step']) for r in P[v]]; b=[float(r['budget']) for r in P[v]]
    ax.step(s,b,where='post',ls=ls,color=c,lw=lw,label=lab,marker=mk,markersize=2.5,markevery=(2,4))
ax.set_xlabel('Item',fontsize=7.5); ax.set_ylabel('Budget $M_I^*$',fontsize=7.5)
ax.set_xlim(0,39); ax.set_ylim(0,1.1); ax.set_yticks([0,0.25,0.5,0.75,1.0])
ax.tick_params(labelsize=6.5); ax.yaxis.grid(True,lw=0.3,color='#dddddd'); ax.set_axisbelow(True)
ax.legend(fontsize=6.3,frameon=False,loc='lower center',bbox_to_anchor=(0.5,1.06),ncol=3,handlelength=2.2,columnspacing=1.0)
fig.tight_layout(pad=0.3)
fig.savefig(O+'probe.pdf')

print('ok')
