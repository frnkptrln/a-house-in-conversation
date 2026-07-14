# The Listening Room

The fourth room in **A House in Conversation**: a 216-second spatial composition in which doing less reveals more.

Movement foregrounds a close, tactile voice. After movement stops, distance begins to arrive after a short pause and opens fully over roughly ten seconds. Horizontal position changes the listening position; there is no hidden vertical mapping. There is no score, success state, body tracking, microphone, camera, analytics, or external service. Pointer, touch, and keyboard input remain entirely inside the browser.

The two fixed stems are deterministic renders of the house's E–B–F-sharp–A seed. They are interlaced into one stereo delivery file. The primary playback path fetches and decodes that file into a Web Audio buffer, then separates the near and depth voices for a clearly audible crossfade. This avoids Safari's unreliable `MediaElementSource` path while retaining a single synchronized source on phones. If Web Audio decoding is unavailable, the same file remains available as a musically complete fixed-mix fallback; that fallback is intentionally non-interactive.

The recordings are final material for this room, not a runtime dependency on [`the-weaving-sound`](https://github.com/frnkptrln/the-weaving-sound). That repository remains the wider SuperCollider workshop and anthology; the house remains the finished audiovisual work.

Rebuild and encode the stems:

```bash
python score.py /tmp/listening-room
ffmpeg -i /tmp/listening-room/near.wav -c:a aac -b:a 96k audio/near.m4a
ffmpeg -i /tmp/listening-room/depth.wav -c:a aac -b:a 96k audio/depth.m4a
ffmpeg -i /tmp/listening-room/listening.wav -c:a aac -b:a 128k audio/listening.m4a
```
