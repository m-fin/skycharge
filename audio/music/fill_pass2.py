#!/usr/bin/env python3
"""Box-side: fill loudnorm pass-2 numbers from a pass-1 (B_measure) job log.
  python3 fill_pass2.py jobs/cabin_chill_loop.json b_log.txt   -> prints the C job cmd as JSON
Targets (I, TP) are read from the job's "loudnorm" field (-16 LUFS / -1.5 dBTP for SKYCHARGE music).
Warns if linear mode can't hold (loudnorm would go dynamic and break the seamless loop)."""
import json, re, sys
job = json.load(open(sys.argv[1])); log = open(sys.argv[2]).read()
m = json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', log, re.S)[-1])
I, TP, LRA = job['loudnorm']['I'], job['loudnorm']['TP'], job['loudnorm']['LRA']
gain = I - float(m['input_i']); ok = True
if float(m['input_tp']) + gain > TP:
    ok = False
    print(f"WARNING: peak would hit {float(m['input_tp'])+gain:.2f} dBTP > {TP}: loudnorm will go DYNAMIC. "
          f"Lower I to <= {TP - float(m['input_tp']) + float(m['input_i']):.2f} in the cmd (or accept a quieter loop).", file=sys.stderr)
if float(m['input_lra']) > LRA:
    ok = False; print(f"WARNING: input LRA {m['input_lra']} > {LRA}; raise LRA in the cmd to >= {float(m['input_lra']):.1f}.", file=sys.stderr)
rep = {'@I': m['input_i'], '@TP': m['input_tp'], '@LRA': m['input_lra'], '@TH': m['input_thresh'], '@OFF': m['target_offset']}
cmd = []
for a in job['C_finalize_template']['cmd']:
    for k, v in rep.items(): a = a.replace(k, v)
    cmd.append(a)
print(json.dumps(cmd))
sys.exit(0 if ok else 2)
