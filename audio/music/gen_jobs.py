#!/usr/bin/env python3
"""Generate ffmpeg-only HomeRender jobs for SKYCHARGE music (Sonic Rift, original material).

Runs on the shared computer and ONLY writes text (filter scripts + job command lists). Nothing is
synthesized here. Patterns are reused from /workspace/sonic-rift/game/premiere/m2ffmpeg/gen_jobs.py:
aevalsrc note recipes, place() with wrapped tails, triple-copy (tile3) circular echo / filtering,
amix, two-pass linear loudnorm. Each cue = 3 Mac jobs, all plain `ffmpeg`:
  A  synth   : -/filter_complex {in:<cue>.fg} -> {out:<cue>_raw.wav}  (float WAV, exact loop length)
  B  measure : loudnorm pass 1 (I=-16) on <cue>_raw.wav -> -f null (JSON stats land in the job log)
  C  finalize: loudnorm pass 2 linear=true (filled by fill_pass2.py from B's log) -> <cue>.ogg

Seamless loops: every full-length source uses frequencies snapped to whole cycles per loop (cyc), drum
patterns are periodic per bar, note tails that run past the end wrap to the start, echoes and noise
filters run on a 3x periodic copy and keep the middle copy, and loop lengths are whole bars and whole samples.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
LN = {'I': -16.0, 'TP': -1.5, 'LRA': 11.0}
LNS = f"I={LN['I']:g}:TP={LN['TP']:g}:LRA={LN['LRA']:g}"
mtof = lambda n: 440 * 2 ** ((n - 69) / 12)
F = lambda x: repr(float(x))
def lp_k(fc): return 1 - math.exp(-2 * math.pi * fc / SR)

class G:
    """Builds one filtergraph script for a loop of L samples."""
    def __init__(s, L): s.L, s.T, s.lines, s.n = L, L / SR, [], 0
    def lab(s, p='s'): s.n += 1; return f'{p}{s.n}'
    def add(s, line): s.lines.append(line + ';')
    def cyc(s, f): return round(f * s.T) / s.T
    def src(s, expr, d):
        o = s.lab(); s.add(f"aevalsrc=exprs='{expr}':s={SR}:d={F(d)}[{o}]"); return o
    def full(s, expr): return s.src(expr, s.T)
    def place(s, items, wrap=True, L_=None):
        """items: ((fn, dur), start_s, gain). Tails past the loop end wrap to the start (seamless)."""
        L_ = L_ or s.L; ins = []
        for (fn, d), t0, g in items:
            i = int(round(t0 * SR)) % L_; n = int(d * SR)
            a = s.src(fn('t'), min(n, L_ - i) / SR); o = s.lab()
            s.add(f'[{a}]volume={F(g)}:precision=double,adelay=delays={i}S:all=1[{o}]'); ins.append(o)
            if wrap and i + n > L_:
                b = s.src(fn(f'(t+{F((L_ - i) / SR)})'), (i + n - L_) / SR); o = s.lab()
                s.add(f'[{b}]volume={F(g)}:precision=double[{o}]'); ins.append(o)
        return s.mix(ins, None, L_)
    def mix(s, ins, gains=None, L_=None):
        L_ = L_ or s.L; o = s.lab('m'); g = '' if not gains else ':weights=' + ' '.join(F(x) for x in gains)
        s.add(''.join(f'[{x}]' for x in ins) + f'amix=inputs={len(ins)}:duration=longest:normalize=0{g},apad=whole_len={L_},atrim=end_sample={L_}[{o}]')
        return o
    def taps(s, d, fb, n):
        return f"aecho=in_gain=1:out_gain=1:delays={'|'.join(F(d*1000*r) for r in range(1, n))}:decays={'|'.join(F(fb**r) for r in range(1, n))}"
    def tile3(s, x):
        a, b, c, o = s.lab(), s.lab(), s.lab(), s.lab()
        s.add(f'[{x}]asplit=3[{a}][{b}][{c}]'); s.add(f'[{a}][{b}][{c}]concat=n=3:v=0:a=1[{o}]'); return o
    def middle(s): return f'atrim=start_sample={s.L}:end_sample={2*s.L},asetpts=PTS-STARTPTS'
    def wrap_echo(s, x, d, fb, n=5):
        t = s.tile3(x); o = s.lab(); s.add(f'[{t}]{s.taps(d, fb, n)},{s.middle()}[{o}]'); return o
    def wrap_filter(s, x, chain):
        t = s.tile3(x); o = s.lab(); s.add(f'[{t}]{chain},{s.middle()}[{o}]'); return o
    def noise(s, seed, chain):
        """Seeded white noise (std 1), filtered in steady state on a 3x periodic copy -> seamless."""
        nz = s.lab(); s.add(f'anoisesrc=d={F(s.T)}:c=white:r={SR}:a=1:s={seed},volume={F(3**.5)}[{nz}]')
        return s.wrap_filter(nz, chain)
    def mul(s, x, expr):
        m = s.full(expr); o = s.lab(); s.add(f'[{x}][{m}]amultiply[{o}]'); return o
    def vol(s, x, g):
        o = s.lab(); s.add(f'[{x}]volume={F(g)}:precision=double[{o}]'); return o
    def text(s, last):
        s.lines[-1] = s.lines[-1][:-1]
        return '\n'.join(s.lines).rsplit(f'[{last}]', 1)[0] + '[out]\n'

def LP(fc): k = lp_k(fc); return f'aiir=z={F(k)}:p=1 {F(-(1-k))}:f=tf:process=d:precision=dbl'
def HP(fc):  # one-pole highpass: ((1+a)/2)(1 - z^-1)/(1 - a z^-1)
    a = math.exp(-2 * math.pi * fc / SR); g = (1 + a) / 2
    return f'aiir=z={F(g)} {F(-g)}:p=1 {F(-a)}:f=tf:process=d:precision=dbl'

# ---------- note recipes: fn(v) -> expression of time variable v, plus duration ----------
def env_ar(v, a, r, d): return f'max(0,min(min(1,{v}/{F(a)}),({F(d)}-{v})/{F(r)}))'
def r_pad(fs, d, a=1.2, bright=0.18):
    def ex(v):
        s = '+'.join(f'sin(2*PI*{F(f*(1+dt))}*{v})' for f in fs for dt in (-.003, 0, .003))
        h = '+'.join(f'sin(4*PI*{F(f*1.001)}*{v})' for f in fs)
        return f'(({s})/3+{bright}*({h}))*{env_ar(v, a, a, d)}*{F(1/len(fs))}'
    return ex, d
def r_ep(fs, d=2.4):  # warm electric-piano-ish chord with soft tremolo
    def ex(v):
        s = '+'.join(f'(sin(2*PI*{F(f)}*{v})*exp(-{v}*1.8)+0.22*sin(2*PI*{F(2*f)}*{v})*exp(-{v}*4.5)+0.05*sin(2*PI*{F(7.02*f)}*{v})*exp(-{v}*14))' for f in fs)
        return f'({s})*min(1,{v}/0.006)*(1+0.12*sin(2*PI*4.3*{v}))*{F(1/len(fs))}'
    return ex, d
def r_bell(f, d=1.8, soft=1.0):
    return (lambda v: '+'.join(f'{a}*sin(2*PI*{F(f*m)}*{v})*exp(-{v}*{F(k*soft)})'
            for m, a, k in [(1, 1, 2.2), (2.01, .35, 5), (3.98, .15, 9), (5.43, .05, 14)]) + f'*min(1,{v}/0.004)'), d
def r_lead(f, d):  # airy lead: sine + soft harmonics, delayed vibrato, short attack/release
    rel = min(.15, d / 3)
    def ex(v):
        ph = f'(2*PI*{F(f)}*{v}+{F(0.006*f/5.5)}*min(1,{v}/0.35)*sin(2*PI*5.5*{v}))'
        return f'(sin({ph})+0.32*sin(2*{ph})+0.12*sin(3*{ph}))*{env_ar(v, 0.025, rel, d)}*(1-0.25*min(1,{v}/{F(d)}))'
    return ex, d + 0.0
def r_bass(f, d):
    return (lambda v: f'(sin(2*PI*{F(f)}*{v})+0.18*sin(4*PI*{F(f)}*{v}))*{env_ar(v, 0.01, 0.07, d)}'), d
def r_bassbar(notes, d):
    """One source holding a bar of bass notes: notes = [(offset_s, freq, dur_s, gain)]."""
    def ex(v):
        return '+'.join(f'{F(g)}*(sin(2*PI*{F(f)}*({v}-{F(o)}))+0.18*sin(4*PI*{F(f)}*({v}-{F(o)})))*max(0,min(min(1,({v}-{F(o)})/0.01),({F(o+dd)}-{v})/0.07))'
                        for o, f, dd, g in notes)
    return ex, d
def r_plucks(notes, d):
    """One source holding several plucks: notes = [(offset_s, freq, gain)]."""
    def ex(v):
        return '+'.join(f'{F(g)}*gte({v},{F(o)})*(sin(2*PI*{F(f)}*({v}-{F(o)}))+0.25*sin(4*PI*{F(f)}*({v}-{F(o)}))*exp(-({v}-{F(o)})*6))*exp(-max(0,{v}-{F(o)})*7)'
                        for o, f, g in notes)
    return ex, d

def periodic_hits(period, hits):
    """Expression of t: sum of identical-every-period hits; hits = [(offset_s, dur, fn(u) expr)]."""
    terms = []
    for off, dur, fn in hits:
        u = f'mod(t+{F(period - off)},{F(period)})'
        terms.append(f'if(lt({u},{F(dur)}),{fn(u)},0)')
    return '+'.join(terms)
kick = lambda f0, sw, sk, dk, g: (lambda u: f'{F(g)}*sin(2*PI*({f0}+{sw}*exp(-{u}*{sk}))*{u})*exp(-{u}*{dk})')
envd = lambda k, g, a=0.002: (lambda u: f'{F(g)}*min(1,{u}/{F(a)})*exp(-{u}*{F(k)})')

# =====================================================================================
# (a) cabin_chill_loop: 75 BPM, F major lo-fi, 40 bars = 128.0 s
#     Fmaj9 - Em7 - Dm9 - Cmaj7(add9), 2 bars each (8-bar cycle x5), soft rain on the glass.
# =====================================================================================
C_BPM, C_BARS = 75, 40
def cabin(L):
    g = G(L); beat = 60 / C_BPM; bar = 4 * beat
    CH = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 64], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]]
    ROOT = [41, 40, 38, 36]
    pads = [(r_pad([mtof(n) for n in CH[(b // 2) % 4]], 2 * bar + 2.5, 1.6), b * bar, 1) for b in range(0, C_BARS, 2)]
    P = g.wrap_filter(g.place(pads), LP(1400))
    # electric piano: beat 1 and the "and" of 2 (lazy lo-fi push), slightly late = human feel
    eps = []
    for b in range(C_BARS):
        ch = [mtof(n + 12) for n in CH[(b // 2) % 4][1:]]
        eps += [(r_ep(ch, 2.6), b * bar + 0.02, .55), (r_ep(ch[:3], 1.8), b * bar + 1.5 * beat + 0.05, .35)]
    E = g.wrap_echo(g.place(eps), beat * 0.75, .28, 4)
    bass = [(r_bass(mtof(ROOT[(b // 2) % 4]), 1.6 * beat), b * bar, .8) for b in range(C_BARS)]
    bass += [(r_bass(mtof(ROOT[(b // 2) % 4] + 7), .8 * beat), b * bar + 2.5 * beat, .5) for b in range(C_BARS)]
    B = g.place(bass)
    # melody: a 4-bar motif, played in bars 8-15 and 24-31 (two phrases each), with an echo
    MOT = [(0, 72, 1), (1, 69, .5), (1.5, 67, 1.5), (4, 69, 1), (5, 67, 1), (6, 64, 2), (8, 67, 1), (9, 64, .5), (9.5, 62, 1.5),
           (12, 67, 1), (13, 64, .5), (13.5, 62, .5), (14, 59, 2)]
    mel = []
    for start in (8, 12, 24, 28):
        for o, n, dur in MOT: mel.append((r_bell(mtof(n + 12), 1.2 + dur * beat, 0.8), start * bar + o * beat, .45))
    M = g.wrap_echo(g.place(mel), beat * 1.5, .35, 5)
    # drums: one bar pattern, periodic -> seamless. kick 1 + "and" of 3, rim/snare 2 + 4, swung hats
    K = g.full(periodic_hits(bar, [(0, .5, kick(45, 35, 22, 7, .9)), (2.5 * beat, .5, kick(45, 35, 22, 7, .6))]))
    sn_env = g.full(periodic_hits(bar, [(beat, .3, envd(18, 1)), (3 * beat, .3, envd(18, 1))]))
    SN = g.noise(11, f'{HP(900)},{LP(4500)}')
    o = g.lab(); g.add(f'[{SN}][{sn_env}]amultiply[{o}]'); SN = o
    sw = beat * 0.58  # swing
    hat_env = g.full(periodic_hits(bar, [(k * beat + (sw if h else 0), .12, envd(45, .7 if h else 1)) for k in range(4) for h in (0, 1)]))
    HH = g.noise(12, f'{HP(6000)}')
    o = g.lab(); g.add(f'[{HH}][{hat_env}]amultiply[{o}]'); HH = o
    # drums dip to 15% around bars 1-3 of every 20 (gentle breathing); envelope is periodic over the loop
    half = 20 * bar; dr = f'clip(abs(mod(t,{F(half)})-{F(2*bar)})/{F(bar)}-1,0,1)'
    DR = g.mul(g.mix([K, SN, HH], [1, .22, .07]), f'(0.15+0.85*{dr})')
    RAIN = g.noise(13, f'{HP(1500)},{LP(7000)}')
    RAIN = g.mul(RAIN, f'(0.8+0.2*sin(2*PI*t/{F(8*bar)}))')
    HUM = g.full(f'(sin(2*PI*{F(g.cyc(55))}*t)+0.4*sin(2*PI*{F(g.cyc(110.2))}*t))*(1+0.1*sin(2*PI*t/{F(16*bar)}))*0.05')
    mix = g.mix([P, E, B, M, DR, RAIN, HUM], [.6, .5, .55, .35, .8, .025, 1])
    out = g.wrap_filter(mix, LP(9000))   # lo-fi top roll-off
    return g, out

# =====================================================================================
# (b) flight_theme_loop: 105 BPM, D major, 56 bars = 128.0 s
#     D - A - Bm - G (one bar each). Sections: intro 8 | theme A 16 | theme B 16 | glide 16 -> intro.
# =====================================================================================
F_BPM, F_BARS = 105, 56
def flight(L):
    g = G(L); beat = 60 / F_BPM; bar = 4 * beat
    CH = [[62, 66, 69, 74], [61, 64, 69, 73], [59, 62, 66, 71], [59, 62, 67, 71]]   # D, A, Bm, G (voiced)
    ROOT = [38, 33, 35, 31]
    pads = [(r_pad([mtof(n - 12) for n in CH[b % 4]] + [mtof(CH[b % 4][0])], bar + 1.6, .5, .12), b * bar, 1) for b in range(F_BARS)]
    P = g.wrap_filter(g.place(pads), LP(2600))
    # arpeggio: 8ths per bar, one source per bar; louder in the theme sections
    def sec_gain(b, a):  # (intro, A, B, glide)
        return a[0] if b < 8 else a[1] if b < 24 else a[2] if b < 40 else a[3]
    arps = []
    for b in range(F_BARS):
        ch = CH[b % 4]; seq = [ch[0], ch[1], ch[2], ch[3], ch[0] + 12, ch[3], ch[2], ch[1]]
        notes = [(i * beat / 2, mtof(n + 12), 1.0 if i % 2 == 0 else .7) for i, n in enumerate(seq)]
        arps.append((r_plucks(notes, bar + 0.6), b * bar, sec_gain(b, (.5, .35, .45, .55))))
    A = g.wrap_echo(g.place(arps), beat * 0.75, .3, 4)
    # bass: root 8th-note pulse with an octave pop; off in intro, soft in glide
    bass = []
    for b in range(8, F_BARS):
        r = ROOT[b % 4]; gb = sec_gain(b, (0, .7, .85, .45))
        notes = [(i * beat / 2, mtof(r + (12 if i == 6 else 0)), beat * .42, 1 if i % 2 == 0 else .7) for i in range(8)]
        bass.append((r_bassbar(notes, bar + 0.05), b * bar, gb))
    B = g.place(bass)
    # theme: 4-bar question + 4-bar answer, repeated; B section an octave up with harmony thirds
    Q = [(0, 74, 1), (1, 76, .5), (1.5, 78, 1.5), (3, 76, .5), (3.5, 74, .5),
         (4, 73, 1.5), (5.5, 69, .5), (6, 73, 1), (7, 76, 1),
         (8, 74, 1), (9, 73, .5), (9.5, 71, 1.5), (11, 69, 1),
         (12, 67, 1), (13, 69, .5), (13.5, 71, .5), (14, 74, 2)]
    ANS = Q[:13] + [(12, 79, 1), (13, 78, 1), (14, 76, 1), (15, 73, 1)]
    lead = []
    def phrase(start, notes, tr, gain, harm=False):
        for o, n, d in notes:
            lead.append((r_lead(mtof(n + tr), d * beat * 0.92), start * bar + o * beat, gain))
            if harm: lead.append((r_lead(mtof(n + tr - (4 if n % 12 in (1, 6, 11) else 3)), d * beat * 0.92), start * bar + o * beat, gain * .45))
    phrase(8, Q, 0, .5); phrase(12, ANS, 0, .5); phrase(16, Q, 0, .5); phrase(20, ANS, 0, .5)
    phrase(24, Q, 0, .45, True); phrase(28, ANS, 0, .45, True); phrase(32, Q, 12, .32); phrase(36, ANS, 12, .32)
    phrase(44, Q[:9], 0, .3)   # glide: a fragment of the theme, then air
    LD = g.wrap_echo(g.place(lead), beat * 0.75, .32, 5)
    # drums (per-bar periodic): kick 1, 2.5, 3; clap 2 + 4; 8th hats with offbeat accent; shaped by section
    K = g.full(periodic_hits(bar, [(0, .45, kick(48, 40, 24, 8, 1)), (1.5 * beat, .45, kick(48, 40, 24, 8, .6)), (2 * beat, .45, kick(48, 40, 24, 8, .9))]))
    cl_env = g.full(periodic_hits(bar, [(beat, .25, envd(22, 1)), (beat + 0.012, .25, envd(22, .6)), (3 * beat, .25, envd(22, 1)), (3 * beat + 0.012, .25, envd(22, .6))]))
    CL = g.noise(21, f'{HP(1200)},{LP(6000)}'); o = g.lab(); g.add(f'[{CL}][{cl_env}]amultiply[{o}]'); CL = o
    hat_env = g.full(periodic_hits(bar, [(k * beat / 2, .1, envd(50, 1 if k % 2 else .55)) for k in range(8)]))
    HH = g.noise(22, f'{HP(7000)}'); o = g.lab(); g.add(f'[{HH}][{hat_env}]amultiply[{o}]'); HH = o
    ramp = lambda a, b, ru, rd: f'clip((t-{F(a - ru)})/{F(ru)},0,1)*clip(({F(b)}-t)/{F(rd)},0,1)'
    kick_on = ramp(8 * bar, 44 * bar, .05, 4 * bar)        # kick lands on theme A's downbeat, fades through the glide
    full_on = ramp(24 * bar, 40 * bar, .05, bar)           # claps in theme B
    hat_on = f'(0.35+0.65*{ramp(8*bar, 52*bar, .05, 2*bar)})'
    K = g.mul(K, kick_on); CL = g.mul(CL, full_on); HH = g.mul(HH, hat_on)
    # riser into the downbeat of theme A (bars 6-8) and air/wind bed with slow swell
    RS = g.noise(23, f'{HP(800)},{LP(5000)}')
    RS = g.mul(RS, f'pow(clip((t-{F(6*bar)})/{F(2*bar)},0,1),2)*lt(t,{F(8*bar)})')
    AIR = g.noise(24, f'{LP(900)},{LP(1400)}')
    AIR = g.mul(AIR, f'(0.6+0.4*sin(2*PI*t/{F(8*bar)}))')
    SUB = g.full(f'sin(2*PI*{F(g.cyc(mtof(26)))}*t)*(0.5+0.5*sin(2*PI*t/{F(4*bar)}-PI/2))*0.06')
    mix = g.mix([P, A, B, LD, K, CL, HH, RS, AIR, SUB], [.55, .4, .5, .5, .9, .2, .06, .05, .05, 1])
    return g, mix

CUES = [('cabin_chill_loop', cabin, C_BPM, C_BARS), ('flight_theme_loop', flight, F_BPM, F_BARS)]

def main():
    jd = os.path.join(HERE, 'jobs'); os.makedirs(jd, exist_ok=True); index = []
    for name, fn, bpm, bars in CUES:
        L = round(bars * 4 * 60 / bpm * SR); g, last = fn(L); fg = f'{name}.fg'
        open(os.path.join(jd, fg), 'w').write(g.text(last))
        A = ['ffmpeg', '-y', '-/filter_complex', f'{{in:{fg}}}', '-map', '[out]', '-ac', '1', '-ar', str(SR),
             '-c:a', 'pcm_f32le', f'{{out:{name}_raw.wav}}']
        B = ['ffmpeg', '-y', '-i', f'{{in:{name}_raw.wav}}', '-af', f'loudnorm={LNS}:print_format=json', '-f', 'null', '-']
        C = ['ffmpeg', '-y', '-i', f'{{in:{name}_raw.wav}}', '-af',
             f'loudnorm={LNS}:measured_I=@I:measured_TP=@TP:measured_LRA=@LRA:measured_thresh=@TH:offset=@OFF:linear=true:print_format=json,aresample={SR}',
             '-ac', '1', '-c:a', 'libvorbis', '-q:a', '5', f'{{out:{name}.ogg}}']
        jobs = {'cue': name, 'bpm': bpm, 'bars': bars, 'samples': L, 'seconds': L / SR, 'loudnorm': LN,
                'A_synth': {'inputs': [fg], 'outputs': [f'{name}_raw.wav'], 'cmd': A},
                'B_measure': {'inputs': [f'{name}_raw.wav'], 'outputs': [], 'cmd': B},
                'C_finalize_template': {'inputs': [f'{name}_raw.wav'], 'outputs': [f'{name}.ogg'], 'cmd': C}}
        json.dump(jobs, open(os.path.join(jd, f'{name}.json'), 'w'), indent=1)
        index.append((name, bpm, bars, L, len(g.lines), os.path.getsize(os.path.join(jd, fg))))
    for r in index: print('%-18s %3d BPM %2d bars %8d samples %6.1fs  %4d filters  %7d bytes' % (r[0], r[1], r[2], r[3], r[3] / SR, r[4], r[5]))
if __name__ == '__main__': main()
