# SKYCHARGE: what's blocking the Xbox Store

Goal: live on the Xbox Store by June 30, 2027.

The Xbox One port is a native MonoGame build. MonoGame is free. Godot has no Xbox One support. Unity Pro is about $2,310 a year. The store path is ID@Xbox.

## Blockers, in order

1. **ID@Xbox approval.** The application is drafted and has not been submitted. The owner reviews it on November 16, 2026.
2. **A Windows 10 or 11 PC.** MonoGame's Xbox tooling and Microsoft's GDK need Windows. The owner has an RTX 3080 and is building a PC around it. Desk and PC setup is planned for about November 29, 2026.
3. **Dev kit and GDK access.** This follows ID@Xbox approval.
4. **Certification.** The shipping build has to handle suspend and resume, a controller disconnect, and title-safe UI. Pull request #15 added lifecycle pause and save, and title-safe HUD insets, in the web build. That is groundwork for the same checks. Certification is still ahead, on the MonoGame build.
5. **IARC age rating.** Free.

## Secondary path: EdgeHTML web package

`xbox/pack-legacy.sh` still builds an unsigned EdgeHTML package for Xbox One Dev Mode. That console browser is EdgeHTML 18: WebGL1, ES2017, no inline scripts, and no Ogg. Music in the package is MP3 plus 22.05 kHz WAV. Signing stays off this repo; another machine signs the file. This package is a Dev Mode sideload. The Store release is the MonoGame port.

The web build pauses and saves when the app is suspended, and the HUD uses a 5% title-safe inset (`--safe-x: 5vw`, `--safe-y: 5vh`), from pull request #15. Those cover the same ideas as the certification checks above. They are not a substitute for the MonoGame certification pass.
