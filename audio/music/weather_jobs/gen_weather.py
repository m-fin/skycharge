#!/usr/bin/env python3
"""SKYCHARGE weather layers (Sonic Rift). Runs on the shared computer and ONLY writes text (ffmpeg filtergraphs).
Each layer is 56 bars at 105 BPM = 128.000 s = 5,644,800 samples, the same D - A - Bm - G one-bar chord cycle as
flight_theme_loop, sample-aligned (bar 0 = sample 0). It's seamless: tones snapped to whole cycles, note tails wrap,
echoes, filters and noise run on a 3x periodic copy with the middle copy kept. Registers stay out of the lead's range (about G4-A5)."""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from gen_jobs import G, LP, HP, r_pad, r_ep, r_bell, r_plucks, mtof, F, SR
HERE = os.path.dirname(os.path.abspath(__file__))
BPM, BARS = 105, 56; L = round(BARS * 4 * 60 / BPM * SR); beat = 60 / BPM; bar = 4 * beat
CH = [[62, 66, 69, 74], [61, 64, 69, 73], [59, 62, 66, 71], [59, 62, 67, 71]]   # D, A, Bm, G (as in flight)
ROOT = [38, 33, 35, 31]
TONES = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [59, 62, 67]]                  # triad pitch classes per bar

def rain():
    g = G(L)
    drops = g.mul(g.noise(31, f'{HP(1400)},{LP(6500)}'), f'(0.75+0.25*sin(2*PI*t/{F(8*bar)}))')
    patter = g.mul(g.noise(32, f'{HP(350)},{LP(2200)},{LP(2200)}'), f'(0.7+0.3*sin(2*PI*t/{F(28*bar)}))')
    # low, soft electric piano: a chord on beat 1 every 2 bars (half-time = calm), a 3-note figure every 4 bars
    eps = []
    for b in range(0, BARS, 2):
        eps.append((r_ep([mtof(n - 12) for n in CH[b % 4][:3]], 3.4), b * bar + 0.03, .6))
    for b in range(2, BARS, 4):
        t3 = TONES[b % 4]
        eps += [(r_ep([mtof(t3[2] - 12)], 1.6), b * bar + 2 * beat, .35), (r_ep([mtof(t3[1] - 12)], 1.6), b * bar + 2.5 * beat, .3),
                (r_ep([mtof(t3[0] - 12)], 2.2), b * bar + 3 * beat, .35)]
    E = g.wrap_filter(g.wrap_echo(g.place(eps), beat * 1.5, .3, 4), LP(1800))
    pad = g.wrap_filter(g.place([(r_pad([mtof(ROOT[b % 4] + 12), mtof(ROOT[b % 4] + 19)], bar + 1.6, .6, .03), b * bar, 1) for b in range(BARS)]), LP(700))
    return g, g.mix([drops, patter, E, pad], [.05, .025, .55, .35])

def fog():
    g = G(L)
    # washed-out pad: chord per bar, slow attack, dark and soft, breathing over 8 bars
    P = g.wrap_filter(g.place([(r_pad([mtof(n - 12) for n in CH[b % 4][1:]] + [mtof(ROOT[b % 4] + 12)], bar + 2.4, 1.1, .05), b * bar, 1) for b in range(BARS)]), LP(1300))
    P = g.mul(P, f'(0.6+0.4*sin(2*PI*t/{F(8*bar)}-PI/2))')
    # high shimmer: sparse soft sine grains on chord tones two octaves up, with a long echo
    r = random.Random(41); grains = []
    for b in range(BARS):
        for _ in range(r.choice([0, 1, 1, 2])):
            n = r.choice(TONES[b % 4]) + 24; d = r.uniform(1.2, 2.6); f = mtof(n)
            grains.append((((lambda v, f=f, d=d: f'sin(2*PI*{F(f)}*{v})*0.5*(1-cos(2*PI*{v}/{F(d)}))'), d), b * bar + r.uniform(0, 3) * beat, r.uniform(.08, .16)))
    S = g.wrap_echo(g.place(grains), beat * 1.5, .45, 6)
    mist = g.mul(g.noise(42, f'{HP(300)},{LP(1600)},{LP(1600)}'), f'(0.6+0.4*sin(2*PI*t/{F(28*bar)}))')
    return g, g.mix([P, S, mist], [.5, .5, .05])

def cloudy():
    g = G(L)
    # open bright pad: root, fifth, ninth (sus/open voicing), airy
    P = g.wrap_filter(g.place([(r_pad([mtof(ROOT[b % 4] + 24), mtof(ROOT[b % 4] + 31), mtof(ROOT[b % 4] + 38)], bar + 1.6, .6, .25), b * bar, 1) for b in range(BARS)]), LP(4200))
    P = g.wrap_filter(P, HP(180))
    # light bells high above the lead, on off-beats (leaves the downbeats to the melody): a 3-note figure every 2 bars
    bells = []
    for b in range(0, BARS, 2):
        t3 = TONES[b % 4]; up = [t3[0] + 24, t3[1] + 24, t3[2] + 24]
        seq = [(1.5, up[2]), (2.5, up[1]), (3.5, up[0] + (12 if b % 8 == 6 else 0))]
        bells += [(r_bell(mtof(n), 1.6, 1.1), b * bar + o * beat, .3) for o, n in seq]
    B = g.wrap_echo(g.place(bells), beat * 0.75, .3, 5)
    # soft plucked 8ths on the 'and' of each beat in bars 2-3 of every 4 (light motion)
    pl = []
    for b in range(BARS):
        if b % 4 in (1, 2):
            ch = TONES[b % 4]; notes = [(k * beat + beat / 2, mtof(ch[k % 3] + 12), .6) for k in range(4)]
            pl.append((r_plucks(notes, bar + .5), b * bar, 1))
    PL = g.wrap_echo(g.place(pl), beat * 0.75, .25, 4)
    air = g.mul(g.noise(51, f'{HP(1500)},{LP(5000)}'), f'(0.7+0.3*sin(2*PI*t/{F(8*bar)}))')
    return g, g.mix([P, B, PL, air], [.45, .4, .2, .015])

def text(g, last):
    s = g.text(last); return s
for name, fn in (('weather_rain_layer', rain), ('weather_fog_layer', fog), ('weather_cloudy_layer', cloudy)):
    g, last = fn(); open(os.path.join(HERE, name + '.fg'), 'w').write(g.text(last))
    print(name, len(g.lines), 'filters', L, 'samples')
