# A House in Conversation

An audiovisual work that exists as one persistent, permeable house.

The current root experience is the first V2 prototype. It replaces the earlier collection of eight separately addressable room pages with a single document in which sound, residue, and selective memory continue across changes of place.

The binding German concept and implementation checklist are preserved in [V2-KONZEPT.md](V2-KONZEPT.md).

## The V2 house

| Role | Part |
| --- | --- |
| Visible places | Conversation, Colour, Garden, Window |
| Hidden place | Machine |
| House-wide acoustic layer | Listening |
| Residue carried between places | Afterimage |
| Selective, distributed memory | Archive |

The entrance contains no room list. One gesture opens the house and leads directly into Conversation. The hall only appears afterwards; it begins incomplete. Garden becomes available after an interaction or sustained stillness. Machine appears only when the house has encountered movement, stillness, and another consequential gesture.

There is no permanent global navigation, completion counter, second room threshold, spoken narrator, or separate Archive destination.

## What the house remembers

Memory is stored only in the visitor's browser under `a-house-in-conversation-v2`. It contains coarse consequences:

- accumulated movement and stillness;
- relations touched in Conversation;
- mixtures made in Colour;
- blooms invited in the Garden;
- small changes made below the house;
- a short, decaying set of visual traces;
- coarse accumulated attention, without retaining a route through the house.

It does not store pointer paths, text input, identity, analytics, or a visited-room checklist. Traces weaken whenever another one is formed and decay across time. Their colour and angle also drift slightly. Coarse behavioral weights recede during long absences, so a hidden opening can close again. The house does not reproduce its past exactly.

## Sound

The existing original recordings remain source material, but their role has changed.

The former Listening Room now runs through the house as two continuous layers:

- movement brings the near, tactile layer forward;
- stillness opens the distant layer;
- horizontal and vertical position carry no hidden semantic category.

Conversation, Colour, and Garden retain their own recordings at lower levels. Room changes crossfade without reloading the document. Window remains almost entirely dependent on the house-wide listening layer.

## Earlier room studies

The directories under `rooms/` preserve the standalone V1 studies as material and history. They are no longer linked from the V2 work. Afterimage is retained there only as an earlier Web Audio study; its browser-synthesized voice and concluding sentence have been removed.

## Run

Serve the repository root with any static web server and open `index.html`. Audio begins only after the entrance gesture, as required by browsers.

## Status

V2 prototype, revised 5 September 2026; still awaiting browser and listening review.

The shared shell, direct entry, sound crossfades, behavioral discovery, cross-room residue, and distributed memory are implemented. Their combined experience has not yet been accepted in a real browser with sound.

The September revision gives Conversation a small unfinished exchange: an open door, moving light, a chair left in place. It corrects the duration of pigment contact, makes forgetting depend on elapsed time rather than reopening, counts keyboard gestures toward discovery, keeps hidden places out of focus and screen-reader navigation, and lets each new afterimage finish its own transition. The final gesture is saved when the page is left.

Run `npm test` for syntax, the existing V2 contract, and four focused behavior regressions. Those tests cover timing, memory and keyboard movement; they do not establish visual composition, acoustic quality, mobile Safari playback, or end-to-end accessibility. The current review environment cannot preview this plain static project.

The next material pass should introduce a specific field recording that returns at different distances in the house. A recurring sound from one actual place would give the rooms a shared origin. Selection of that recording and the final acoustic composition remain open.

Made in conversation. No single voice is the sole author.
