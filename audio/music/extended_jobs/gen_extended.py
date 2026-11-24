#!/usr/bin/env python3
"""SKYCHARGE extended mixes (Sonic Rift). Runs on the shared computer and ONLY writes text.
Step 1 (Mac): <cue>_stems.fg renders each layer as its own seamless 128 s stem (one ffmpeg run, many outputs).
Step 2 (Mac): <cue>_arrange.fg tiles the stems (-stream_loop) and shapes each one with a per-section gain
envelope, so layers come and go across sections. Then a gentle limiter and constant gain to -16 LUFS (see render_extended.sh).
Recipes come from ../gen_jobs.py (same key, tempo, chords and sounds). New material: melody variations, bright and warm pads."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from gen_jobs import (G, LP, HP, r_pad, r_ep, r_bell, r_lead, r_bass, r_bassbar, r_plucks, periodic_hits, kick, envd, mtof, F, SR)
HERE = os.path.dirname(os.path.abspath(__file__))

def stems_text(g, stems):
    lines = list(g.lines)
    for name, lab in stems.items(): lines.append(f'[{lab}]asetpts=PTS-STARTPTS[st_{name}];')
    lines[-1] = lines[-1][:-1]
    return '\n'.join(lines) + '\n'

# ------------------------------- cabin: 75 BPM F major, 40-bar stems -------------------------------
def cabin_stems():
    BPM, BARS = 75, 40; L = round(BARS * 4 * 60 / BPM * SR); g = G(L); beat = 60 / BPM; bar = 4 * beat
    CH = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 64], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]]; ROOT = [41, 40, 38, 36]
    S = {}
    S['pad'] = g.wrap_filter(g.place([(r_pad([mtof(n) for n in CH[(b // 2) % 4]], 2 * bar + 2.5, 1.6), b * bar, 1) for b in range(0, BARS, 2)]), LP(1400))
    S['pad_bright'] = g.wrap_filter(g.place([(r_pad([mtof(n) for n in CH[(b // 2) % 4]] + [mtof(CH[(b // 2) % 4][2] + 12)], 2 * bar + 2.5, 1.6, .35), b * bar, 1) for b in range(0, BARS, 2)]), LP(3200))
    eps = []
    for b in range(BARS):
        ch = [mtof(n + 12) for n in CH[(b // 2) % 4][1:]]
        eps += [(r_ep(ch, 2.6), b * bar + 0.02, .55), (r_ep(ch[:3], 1.8), b * bar + 1.5 * beat + 0.05, .35)]
    S['ep'] = g.wrap_echo(g.place(eps), beat * 0.75, .28, 4)
    bass = [(r_bass(mtof(ROOT[(b // 2) % 4]), 1.6 * beat), b * bar, .8) for b in range(BARS)]
    bass += [(r_bass(mtof(ROOT[(b // 2) % 4] + 7), .8 * beat), b * bar + 2.5 * beat, .5) for b in range(BARS)]
    S['bass'] = g.place(bass)
    MOT = [(0, 72, 1), (1, 69, .5), (1.5, 67, 1.5), (4, 69, 1), (5, 67, 1), (6, 64, 2), (8, 67, 1), (9, 64, .5), (9.5, 62, 1.5),
           (12, 67, 1), (13, 64, .5), (13.5, 62, .5), (14, 59, 2)]
    S['bell'] = g.wrap_echo(g.place([(r_bell(mtof(n + 12), 1.2 + d * beat, 0.8), s * bar + o * beat, .45) for s in range(0, BARS, 4) for o, n, d in MOT]), beat * 1.5, .35, 5)
    # new: a flute-like answer melody (same chords), an octave lower and smoother
    VAR = [(0, 69, 1), (1, 72, 1), (2, 76, 2), (4, 74, 1), (5, 72, 1), (6, 69, 2), (8, 71, 1), (9, 74, 1), (10, 76, 2), (12, 74, 1), (13, 71, 1), (14, 67, 2)]
    S['flute'] = g.wrap_echo(g.place([(r_lead(mtof(n), d * beat * 0.95), s * bar + o * beat, .4) for s in range(0, BARS, 4) for o, n, d in VAR]), beat * 1.5, .3, 4)
    S['kick'] = g.full(periodic_hits(bar, [(0, .5, kick(45, 35, 22, 7, .9)), (2.5 * beat, .5, kick(45, 35, 22, 7, .6))]))
    sn_env = g.full(periodic_hits(bar, [(beat, .3, envd(18, 1)), (3 * beat, .3, envd(18, 1))]))
    SN = g.noise(11, f'{HP(900)},{LP(4500)}'); o = g.lab(); g.add(f'[{SN}][{sn_env}]amultiply[{o}]'); S['snare'] = o
    sw = beat * 0.58
    hat_env = g.full(periodic_hits(bar, [(k * beat + (sw if h else 0), .12, envd(45, .7 if h else 1)) for k in range(4) for h in (0, 1)]))
    HH = g.noise(12, f'{HP(6000)}'); o = g.lab(); g.add(f'[{HH}][{hat_env}]amultiply[{o}]'); S['hats'] = o
    S['rain'] = g.mul(g.noise(13, f'{HP(1500)},{LP(7000)}'), f'(0.8+0.2*sin(2*PI*t/{F(8*bar)}))')
    S['hum'] = g.full(f'(sin(2*PI*{F(g.cyc(55))}*t)+0.4*sin(2*PI*{F(g.cyc(110.2))}*t))*(1+0.1*sin(2*PI*t/{F(16*bar)}))*0.05')
    return g, S, bar, L

# ------------------------------- flight: 105 BPM D major, 56-bar stems -------------------------------
def flight_stems():
    BPM, BARS = 105, 56; L = round(BARS * 4 * 60 / BPM * SR); g = G(L); beat = 60 / BPM; bar = 4 * beat
    CH = [[62, 66, 69, 74], [61, 64, 69, 73], [59, 62, 66, 71], [59, 62, 67, 71]]; ROOT = [38, 33, 35, 31]
    S = {}
    S['pad'] = g.wrap_filter(g.place([(r_pad([mtof(n - 12) for n in CH[b % 4]] + [mtof(CH[b % 4][0])], bar + 1.6, .5, .12), b * bar, 1) for b in range(BARS)]), LP(2600))
    S['pad_bright'] = g.wrap_filter(g.place([(r_pad([mtof(n - 12) for n in CH[b % 4]] + [mtof(CH[b % 4][0]), mtof(CH[b % 4][2])], bar + 1.6, .5, .3), b * bar, 1) for b in range(BARS)]), LP(5000))
    S['pad_warm'] = g.wrap_filter(g.place([(r_pad([mtof(ROOT[b % 4] + 12)] + [mtof(n - 12) for n in CH[b % 4]], bar + 1.8, .6, .04), b * bar, 1) for b in range(BARS)]), LP(1100))
    arps = []
    for b in range(BARS):
        ch = CH[b % 4]; seq = [ch[0], ch[1], ch[2], ch[3], ch[0] + 12, ch[3], ch[2], ch[1]]
        arps.append((r_plucks([(i * beat / 2, mtof(n + 12), 1.0 if i % 2 == 0 else .7) for i, n in enumerate(seq)], bar + 0.6), b * bar, 1))
    S['arp'] = g.wrap_echo(g.place(arps), beat * 0.75, .3, 4)
    bass = []
    for b in range(BARS):
        r = ROOT[b % 4]
        bass.append((r_bassbar([(i * beat / 2, mtof(r + (12 if i == 6 else 0)), beat * .42, 1 if i % 2 == 0 else .7) for i in range(8)], bar + 0.05), b * bar, 1))
    S['bass'] = g.place(bass)
    Q = [(0, 74, 1), (1, 76, .5), (1.5, 78, 1.5), (3, 76, .5), (3.5, 74, .5), (4, 73, 1.5), (5.5, 69, .5), (6, 73, 1), (7, 76, 1),
         (8, 74, 1), (9, 73, .5), (9.5, 71, 1.5), (11, 69, 1), (12, 67, 1), (13, 69, .5), (13.5, 71, .5), (14, 74, 2)]
    ANS = Q[:13] + [(12, 79, 1), (13, 78, 1), (14, 76, 1), (15, 73, 1)]
    def lead_stem(tr, gain, harm=False):
        items = []
        for k in range(0, BARS, 8):
            for start, notes in ((k, Q), (k + 4, ANS)):
                for o, n, d in notes:
                    items.append((r_lead(mtof(n + tr), d * beat * 0.92), start * bar + o * beat, gain))
                    if harm: items.append((r_lead(mtof(n + tr - (4 if n % 12 in (1, 6, 11) else 3)), d * beat * 0.92), start * bar + o * beat, gain * .45))
        return g.wrap_echo(g.place(items), beat * 0.75, .32, 5)
    S['leadA'] = lead_stem(0, .5); S['leadB'] = lead_stem(0, .45, True); S['leadHi'] = lead_stem(12, .32)
    # new: a slower, laid-back bell variation of the theme (same D - A - Bm - G chords)
    VQ = [(0, 78, 2), (2, 76, 1), (3, 74, 1), (4, 73, 3), (7, 69, 1), (8, 71, 2), (10, 74, 1), (11, 76, 1), (12, 74, 4)]
    VA = [(0, 78, 2), (2, 81, 1), (3, 79, 1), (4, 76, 2), (6, 73, 2), (8, 74, 1), (9, 76, 1), (10, 78, 2), (12, 74, 4)]
    items = [(r_bell(mtof(n), 1.2 + d * beat, 0.8), start * bar + o * beat, .4) for k in range(0, BARS, 8) for start, notes in ((k, VQ), (k + 4, VA)) for o, n, d in notes]
    S['bell'] = g.wrap_echo(g.place(items), beat * 0.75, .3, 5)
    S['kick'] = g.full(periodic_hits(bar, [(0, .45, kick(48, 40, 24, 8, 1)), (1.5 * beat, .45, kick(48, 40, 24, 8, .6)), (2 * beat, .45, kick(48, 40, 24, 8, .9))]))
    cl_env = g.full(periodic_hits(bar, [(beat, .25, envd(22, 1)), (beat + 0.012, .25, envd(22, .6)), (3 * beat, .25, envd(22, 1)), (3 * beat + 0.012, .25, envd(22, .6))]))
    CL = g.noise(21, f'{HP(1200)},{LP(6000)}'); o = g.lab(); g.add(f'[{CL}][{cl_env}]amultiply[{o}]'); S['claps'] = o
    hat_env = g.full(periodic_hits(bar, [(k * beat / 2, .1, envd(50, 1 if k % 2 else .55)) for k in range(8)]))
    HH = g.noise(22, f'{HP(7000)}'); o = g.lab(); g.add(f'[{HH}][{hat_env}]amultiply[{o}]'); S['hats'] = o
    S['riser'] = g.mul(g.noise(23, f'{HP(800)},{LP(5000)}'), f'pow(clip((mod(t,{F(8*bar)})-{F(6*bar)})/{F(2*bar)},0,1),2)')
    S['air'] = g.mul(g.noise(24, f'{LP(900)},{LP(1400)}'), f'(0.6+0.4*sin(2*PI*t/{F(8*bar)}))')
    S['sub'] = g.full(f'sin(2*PI*{F(g.cyc(mtof(26)))}*t)*(0.5+0.5*sin(2*PI*t/{F(4*bar)}-PI/2))*0.06')
    return g, S, bar, L

# ------------------------------- arrangements -------------------------------
# per stem: base gain and changes (bar, gain, ramp_bars[, 'c' = ramp centred on the bar; default ends on the bar])
CABIN = dict(bars=138, fade=(130, 138), lowpass=9000, stems={
 'pad':        (.6,  [(2, 1, 4), (88, .15, 2), (104, 1, 2)]),
 'pad_bright': (.55, [(88, 1, 2), (104, 0, 2)]),
 'ep':         (.5,  [(4, .5, 2), (8, 1, 1), (56, .9, 1), (72, 0, 2), (80, .8, 1), (88, 1, .5), (104, 1.2, 1), (120, 1, 1)]),
 'bass':       (.55, [(8, 1, .02), (56, 0, 1), (80, .8, .02), (88, 1, .02), (104, .9, .5), (128, 0, 4)]),
 'kick':       (.8,  [(8, .6, .02), (24, 1, .02), (56, 0, .5), (84, .6, .02), (88, 1, .02), (104, .8, .02), (124, 0, 2)]),
 'snare':      (.176,[(24, 1, .02), (56, 0, .5), (88, 1, .02), (104, .7, .02), (120, 0, 1)]),
 'hats':       (.056,[(8, 1, .02), (56, 0, 1), (80, .7, .02), (88, 1, .02), (128, 0, 4)]),
 'bell':       (.35, [(24, 1, .02), (40, 0, .2, 'c'), (56, .6, .02), (72, 0, .5, 'c'), (88, 1, .02), (96, 0, .2, 'c'), (104, .7, .02), (128, 0, .5, 'c')]),
 'flute':      (.3,  [(40, 1, .02), (56, 0, .5, 'c'), (72, 1, .02), (80, 0, .5, 'c'), (96, 1, .02), (104, 0, .5, 'c')]),
 'rain':       (.025,[(2, 1, 2), (24, .6, 2), (56, 1, 2), (88, .5, 2), (120, 1, 2)]),
 'hum':        (1,   [(2, 1, 2)]),
})
FLIGHT = dict(bars=178, fade=(168, 178), lowpass=None, stems={
 'pad':        (.55, [(2, 1, 4), (56, 0, 2), (72, 1, 2), (96, 0, 2), (128, 1, 2), (160, .7, 4)]),
 'pad_bright': (.5,  [(96, 1, 2), (112, 0, 2)]),
 'pad_warm':   (.6,  [(56, 1, 2), (72, 0, 2), (112, 1, 2), (128, 0, 2), (160, .7, 4)]),
 'arp':        (.4,  [(4, .5, 4), (8, .35, .5), (24, .45, .5), (40, .55, 1), (56, .3, 2), (64, 0, 4), (72, .45, 2), (80, .35, .5), (96, .45, .5), (112, .4, 1), (128, .45, .5), (144, .55, 1), (160, .4, 2)]),
 'bass':       (.5,  [(8, .7, .02), (24, .85, .02), (40, .45, 1), (56, 0, 1), (72, .5, .02), (80, .7, .02), (96, .85, .02), (112, .55, 1), (128, .85, .02), (144, .45, 1), (160, 0, 4)]),
 'kick':       (.9,  [(8, 1, .02), (44, 0, 4), (80, 1, .02), (112, .6, .02), (128, 1, .02), (148, 0, 4)]),
 'claps':      (.2,  [(24, 1, .02), (40, 0, 1), (96, 1, .02), (112, 0, 1), (128, 1, .02), (144, 0, 1)]),
 'hats':       (.06, [(2, .35, 2), (8, 1, .02), (52, .35, 2), (56, 0, 2), (72, .5, .02), (80, 1, .02), (112, .7, .02), (128, 1, .02), (156, .35, 2), (164, 0, 4)]),
 'riser':      (.05, [(6, 1, .05), (8, 0, .02), (78, 1, .05), (80, 0, .02), (126, 1, .05), (128, 0, .02)]),
 'air':        (.05, [(2, 1, 2), (56, 1.4, 2), (80, 1, 2), (160, 1.4, 4)]),
 'sub':        (1,   [(8, 1, 2), (56, .5, 2), (80, 1, 2), (160, .5, 4)]),
 'leadA':      (.5,  [(8, 1, .02), (24, 0, .2, 'c'), (80, 1, .02), (96, 0, .2, 'c')]),
 'leadB':      (.5,  [(24, 1, .02), (40, 0, .2, 'c'), (128, 1, .02), (144, 0, .2, 'c')]),
 'leadHi':     (.5,  [(96, 1, .02), (112, 0, .2, 'c')]),
 'bell':       (.5,  [(40, 1, .02), (56, 0, .3, 'c'), (64, 1, .02), (72, 0, .3, 'c'), (112, 1, .02), (128, 0, .2, 'c'), (152, 1, .02), (168, 0, .5, 'c')]),
})

def env_expr(changes, bar, base):
    pts = [(0.0, 0.0)]; cur = 0.0
    for c in changes:
        b, gn, r = c[:3]; mode = c[3] if len(c) > 3 else 'e'
        t1 = (b + (r / 2 if mode == 'c' else 0)) * bar; t0 = t1 - r * bar
        pts += [(max(t0, pts[-1][0]), cur), (t1, gn)]; cur = gn
    expr = F(pts[-1][1] * base)
    for (ta, ga), (tb, gb) in reversed(list(zip(pts, pts[1:]))):
        seg = F(ga * base) if tb <= ta else f'({F(ga*base)}+({F((gb-ga)*base)})*(t-{F(ta)})/{F(tb-ta)})'
        expr = f'if(lt(t,{F(tb)}),{seg},{expr})'
    return expr

def arrange_text(arr, order, bar):
    N = round(arr['bars'] * bar * SR); lines = []; labs = []
    for i, name in enumerate(order):
        base, ch = arr['stems'][name]
        lines.append(f"[{i}:a]aformat=sample_fmts=dbl,atrim=end_sample={N},asetnsamples=n=256,volume=eval=frame:precision=double:volume='{env_expr(ch, bar, base)}'[a{i}];")
        labs.append(f'[a{i}]')
    f0, f1 = arr['fade']; post = f",lowpass=f={arr['lowpass']}:poles=1" if arr['lowpass'] else ''
    lines.append(''.join(labs) + f"amix=inputs={len(labs)}:duration=longest:normalize=0,apad=whole_len={N},atrim=end_sample={N}{post},afade=t=out:st={F(f0*bar)}:d={F((f1-f0)*bar)}:curve=qsin[out]")
    return '\n'.join(lines) + '\n', N

def main():
    meta = {}
    for cue, fn, arr in (('cabin_chill', cabin_stems, CABIN), ('flight_theme', flight_stems, FLIGHT)):
        g, S, bar, L = fn(); order = list(arr['stems'])
        assert set(order) == set(S), (set(order) ^ set(S))
        open(os.path.join(HERE, f'{cue}_stems.fg'), 'w').write(stems_text(g, {k: S[k] for k in order}))
        txt, N = arrange_text(arr, order, bar)
        open(os.path.join(HERE, f'{cue}_arrange.fg'), 'w').write(txt)
        tiles = -(-N // L)
        meta[cue] = dict(order=order, loop_samples=L, total_samples=N, seconds=N / SR, stream_loop=tiles - 1, bar_s=bar)
        print(f'{cue}: {len(order)} stems, {len(g.lines)} filters, {N/SR:.1f} s = {arr["bars"]} bars, tiles {tiles}')
    json.dump(meta, open(os.path.join(HERE, 'meta.json'), 'w'), indent=1)
    with open(os.path.join(HERE, 'stems_cmds.txt'), 'w') as f:
        for cue, m in meta.items():
            f.write(cue + ' ' + ' '.join(m['order']) + f" {m['stream_loop']}\n")
if __name__ == '__main__': main()
