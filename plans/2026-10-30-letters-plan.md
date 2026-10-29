# MotoX: letters plan

A side quest, like Tony Hawk's S K A T E letters: the five letters M O T O X
float around the free-ride map, and you grab them by riding (mostly jumping)
through them. For now it's a test bed: simple looks, lots of sliders, so the
user can try it on different seeds and settings and see how it plays.

## What the user asked for

- Five letters spread out from the middle, not bunched up.
- The game finds good spots by itself, and makes sure each letter can really
  be grabbed, by trying the jump with an invisible bike.
- Ramping difficulty: M the easiest, X the hardest ("some sick jump").
- Per letter: where on the jump's arc it floats (0 lift-off, 0.5 the top,
  1 touchdown), how big its grab sphere is, and whether its run-up is shown.
- Respawn on a timer, so grabbing can be tried again without reloading.
- On the HUD, a plain row of the letters, lit as you grab them, in any order.
  Flashy effects wait for a later UI pass.

## How the spots are found

- **Slices.** The map around the middle is cut into five pie slices, out to
  `spread` metres (350 by default; the edge wall starts at 400). Each new seed
  turns the slices to a new angle, so the letters move around.
- **Candidates.** The jump finder already lists every jump. In each slice the
  ghost rides about six of them, from the easiest to the hardest found there,
  so every slice has jumps of several sizes to offer.
- **The ghost bike.** An invisible bike in its own physics world, with the
  same ground, the same bike and the same crash rules as yours. It starts at
  the bottom of the run-up at the jump's speed, holds that speed, keeps to
  the line, keeps the bike level with the ground below while in the air, and
  lands. A ride counts only if it really takes off and lands without
  crashing; if it doesn't, the next jump of about the same size in that slice
  is tried instead. AI riders will later have to do the same jumps, so a
  letter that the ghost can't land isn't a fair letter.
- **The arc is the ghost's real flight.** The finder's flight is a guess (one
  jump: 2.8 s predicted, 3.2 s really flown), so each letter sits on the path
  the ghost actually flew. That's why every letter is collectable: the ghost
  went right through it.
- **How hard a jump is.** Each checked jump gets a difficulty from the
  ghost's real ride: mostly its airtime, plus the speed it needs. Then they
  are ranked across the whole map, 0 the easiest, 1 the hardest.
- **Handing out the letters, after the jumps are known.** Each letter has a
  `difficulty` (M 0, O 0.25, T 0.5, O 0.75, X 1). Every way of giving the five
  letters to the five slices is tried (there are only 120), and the one where
  the letters' jumps best match their difficulties wins, X counting the most.
  So X goes to whichever slice has the sickest jump, and M to the one with a
  gentle one. If a slice has no jump the ghost could land, letters share the
  other slices, each on a different jump.
- **When.** Like the jump search, the ghost rides run a bit at a time between
  frames, so the letters appear a few seconds after the map loads (and after
  each map change), without stalling the game.

## The letters

- **Look.** Bold 3D letters about 2.5 m tall, gold, slowly spinning, with no
  collision (the bike flies straight through). The font is built in, nothing
  downloaded.
- **Grabbing.** When the bike's middle comes within the letter's grab size,
  the letter disappears and lights up on the HUD. Any order.
- **Respawn.** With `respawn` on, a letter comes back `respawnAfter` seconds
  after you grab it. A new map (seed or hill settings) places all five again
  and resets them.
- **Live sliders.** `along` slides a letter along its jump's arc and
  `grabSize` resizes its sphere straight away, no re-check needed (the
  sphere is always centred on the path the ghost flew). Changing
  `difficulty` or `spread` hands out the letters again.
- **Gold lanes.** A letter with `showRunUp` on gets its run-up drawn like the
  jump guide's lanes but gold, shown always (not only when you're near and
  facing it) until you grab it. On for M by default, off for the rest.
- **Settings.** A new `letters` section in config.ts, one folder per letter
  in the panel:

  ```ts
  letters: {
    show: true,
    spread: 350,
    respawn: false,
    respawnAfter: 10,
    each: [
      { letter: 'M', difficulty: 0,    along: 0.1, grabSize: 4,   showRunUp: true },
      { letter: 'O', difficulty: 0.25, along: 0.3, grabSize: 3,   showRunUp: false },
      { letter: 'T', difficulty: 0.5,  along: 0.5, grabSize: 2.5, showRunUp: false },
      { letter: 'O', difficulty: 0.75, along: 0.5, grabSize: 2,   showRunUp: false },
      { letter: 'X', difficulty: 1,    along: 0.5, grabSize: 1.5, showRunUp: false },
    ],
  }
  ```

- **HUD.** A new element, `hud.letters`, top left by default and movable
  like the speedometer: M O T O X, grey until grabbed, gold once you have it.

## Build steps

Stop after each so the user can look at it; test, commit, build, push.

1. **Finding the spots:** the slices, the ghost rides, the difficulty
   ranking and handing out the letters, plus the gold letters drawn in the
   world, so it can be seen on a few seeds where they end up.
2. **Grabbing them:** grab spheres, respawn, the `along` and `grabSize`
   sliders working live, and the HUD row.
3. **Gold lanes:** the `showRunUp` checkbox and its lanes; then check
   several seeds and the hill settings end to end.

## Testing

The parts that decide things are plain code with tests: slicing and handing
out letters (made-up jump lists: X lands in the slice with the hardest jump,
M with the easiest, five slices used when they can be), the ghost on made-up
hills (a kicker it takes off and lands; a jump it can't land is turned down),
where `along` puts a letter on a flight path, grabbing and respawn timing,
and the HUD row's grey and lit letters. In the game, each letter is checked
by riding its jump with the real bike, the way the ghost did, on several
seeds.
