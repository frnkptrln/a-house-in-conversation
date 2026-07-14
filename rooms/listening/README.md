# The Listening Room

The fourth room in **A House in Conversation**: a 216-second spatial composition in which doing less reveals more.

Movement foregrounds a close, tactile voice. After movement stops, distance begins to arrive after a short pause and opens fully over roughly ten seconds. Horizontal position changes the listening position; there is no hidden vertical mapping. There is no score, success state, body tracking, microphone, camera, analytics, or external service. Pointer, touch, and keyboard input remain entirely inside the browser.

The two fixed stems are deterministic renders of the house's E–B–F-sharp–A seed. On desktop they are interlaced into one stereo delivery file, decoded into a Web Audio buffer, and separated again for a clearly audible crossfade. Touch devices stream the two synchronized stems as native media instead, avoiding the large decoded buffer that mobile Safari can fail to allocate. A complete fixed mix is started in the same gesture and remains the audible fallback on browsers that cannot keep both stems active; that fallback is intentionally non-interactive.

The recordings are final material for this room, not a runtime dependency on [`the-weaving-sound`](https://github.com/frnkptrln/the-weaving-sound). That repository remains the wider SuperCollider workshop and anthology; the house remains the finished audiovisual work.

Rebuild and encode the stems:

```bash
python score.py /tmp/listening-room
ffmpeg -i /tmp/listening-room/near.wav -c:a aac -b:a 96k audio/near.m4a
ffmpeg -i /tmp/listening-room/depth.wav -c:a aac -b:a 96k audio/depth.m4a
ffmpeg -i /tmp/listening-room/listening.wav -c:a aac -b:a 128k audio/listening.m4a
```

