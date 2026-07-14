# The Listening Room

The fourth room in **A House in Conversation**: a 216-second spatial composition in which doing less reveals more.

Movement changes the listening position and foregrounds a close, tactile stem. After movement stops, a second synchronized stem opens slowly: first space, then sustained lines, then counterpoint. There is no score, success state, body tracking, microphone, camera, analytics, or external service. Pointer, touch, and keyboard input remain entirely inside the browser.

The two fixed stems are deterministic renders of the house's E–B–F-sharp–A seed. For playback they are interlaced into one stereo file: Web Audio separates the two voices again, while mobile Safari and browsers without a reliable audio graph can play the same file directly. This avoids asking a phone to unlock and synchronize two media elements at once.

The recordings are final material for this room, not a runtime dependency on [`the-weaving-sound`](https://github.com/frnkptrln/the-weaving-sound). That repository remains the wider SuperCollider workshop and anthology; the house remains the finished audiovisual work.

Rebuild and encode the stems:

```bash
python score.py /tmp/listening-room
ffmpeg -i /tmp/listening-room/near.wav -c:a aac -b:a 96k audio/near.m4a
ffmpeg -i /tmp/listening-room/depth.wav -c:a aac -b:a 96k audio/depth.m4a
ffmpeg -i /tmp/listening-room/listening.wav -c:a aac -b:a 128k audio/listening.m4a
```
