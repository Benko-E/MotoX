# MotoX: jump stack plan

The jump finder only sniffs physics: anywhere the ground throws you is a
"jump". Once the channel was cut, its long banks became 181 sideways
"kickers" scoring up to 3.2, while the four kickers the map built scored 1.0
to 1.5 and were found three times out of four. The map builder knows its own
jumps exactly, so it should say so, and the finder should only cover what no
feature has claimed.

## What the user asked for

- Features own their jumps and craft them: the channel's are fast (long, low,
  quick); free roam wants big air (3+ seconds, for tricks later).
- Found jumps stay, lowest in the stack: a map with no features still works,
  and so do the letters.
- Every feature owns its ground: the channel, the clearing, and later ridges,
  big air and the rest.
- AI riders pick by kind: fast jumps racing the track, big air roaming. This
  carries over to more riders and game modes.
- The pink lanes, and any other lane colours added for checking things,
  become a debug setting, off by default.

## How it works

- **The stack.** Every jump says where it came from (`source`: a feature's
  name, or `found`) and what kind it is (`fast` or `bigAir`). Designed jumps
  come first; found jumps after. Found jumps get their kind from their
  airtime (big air from 2.5 s).
- **Owned ground.** Each feature marks the ground it owns: the channel its
  floor and banks, the clearing its calm patch. The finder skips any jump
  whose run-up or flight crosses owned ground, so track banks stop being
  jumps and no found jump flies across the track.
- **Designed jumps.** The channel registers each kicker: its lip, the
  direction it's ridden, its run-up along the track's own line, and a speed
  to hit it at; the flight is worked out the same way the finder does it.
  A test has the ghost ride every one (already: all land on the track).
- **Using the stack.**
  - Lanes (debug): designed jumps ahead first.
  - Letters: designed jumps are always among the ghost's candidates.
  - Helga on the track: as a kicker comes up ahead on his line, he takes it
    as a jump (lined up, at its speed) instead of just riding over it.
  - Helga roaming: goes for big air first, else any jump in view.
- **Debug lanes.** `jumpGuide.show` is off by default and described as a
  debug view.

## Build steps

Stop after each so the user can try it; test, commit, build, push, check the
live site.

1. **The stack:** everything above.
2. **Big air:** the first feature designed against the stack: a big natural
   kicker shaped into a hillside, with a long downslope landing, aimed at 3+
   seconds of air; it owns its ground and registers its jumps as big air.

## Testing

Plain tests for the stack's order and the kinds; on made-up maps: banks
aren't jumps any more, no found jump crosses owned ground, the channel's
kickers are in the stack with the right direction and kind; Helga's choices
by kind; and the ghost riding every designed jump on several seeds. In the
game: lanes on the track's kickers, none off its banks, Helga taking the
kickers.
