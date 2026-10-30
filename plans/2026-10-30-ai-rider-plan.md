# MotoX: first AI rider plan

One AI rider sharing the free-ride map with you, riding about in a relaxed
way and taking a jump now and then. We tune him until he feels right before
adding more riders, collisions or goals.

## What the user asked for

- One rider for now, cruising around "relaxed mode": when a jump comes into
  view ahead he sometimes goes for it, lands, cruises on, and later takes
  another one. Not every jump.
- Daring: he goes for any jump he spots, not only ones proven landable, so he
  sometimes eats dirt. (Later: a skill setting, so a good rider lands
  properly and a novice struggles.)
- Built so it can be steered differently later: free roam ("stay within this
  radius, explore every quarter of the map") must not stop us from later
  telling him exactly where to go, which jump to take, or a checkpoint.
- Number keys to watch riders while tuning: 1 you, 2 the first AI rider, and
  so on; C still cycles the camera views.
- Later, not now: more riders, collisions between riders, goals and races.

## How it works

- **The same bike as you, with a brain instead of a keyboard.** The AI rider
  is a second bike in your physics world, with the same bike settings, crash
  rules and getting back up after a crash. Your keys set throttle, steer, lean
  and powerslide each physics step; his brain sets the same four. So he can't
  cheat. His own colours, from the livery the bike drawing already has. He
  passes through you (no collisions yet).
- **Orders.** The brain carries out one order at a time, from a list:
  - *ride to* a spot,
  - *take a jump*: get to the start of its run-up, line up, hold its speed,
    lean to land, ride out,
  - *cruise*: ride on at an easy speed for a while.

  The riding part only ever does the current order and doesn't care who gave
  it. The ghost bike's riding (hold a speed, keep to a line, level in the
  air) is the starting point for it.
- **Behaviours give the orders.** *Free roam* is the first: when the list
  runs dry it adds orders. It cruises toward a spot in the quarter of the map
  it visits least, staying within `roamRadius` of the middle; and when a jump
  is ahead of him (within `lookAhead` metres and `lookWide` degrees either
  side, its run-up facing roughly his way) and he's not just had one, it may
  add "take this jump" first, with a chance set by `jumpAppetite`. Later a
  race, a letter hunt or you pointing at a jump give orders the same way,
  and can jump the queue; nothing in free roam is in the way of that.
- **Steep ground.** While cruising he steers round slopes too steep to ride
  up, by looking at the ground ahead and turning toward the gentler side.
  (A proper route planner can come later if he gets stuck.)
- **Settings.** A new `ai` section in config.ts, read live:

  ```ts
  ai: {
    riders: 1,
    cruiseSpeed: 45,     // km/h while cruising
    roamRadius: 350,     // metres from the middle he stays within
    lookAhead: 120,      // metres he looks ahead for jumps
    lookWide: 35,        // degrees either side he looks
    jumpAppetite: 0.5,   // chance he goes for a jump he spots, 0 to 1
    jumpCooldown: 12,    // seconds he cruises after a jump before another
  }
  ```

- **Watching him.** 1 puts the camera on you, 2 on the AI rider (3, 4... for
  more later). C cycles chase, close, far, helmet and fly for whoever you
  watch. The keys always ride your own bike. A temporary tuning aid: later
  riding alongside him is the game.

## Build steps

Stop after each so the user can look at it; test, commit, build, push.

1. **A rider that rides:** the second bike in his colours, the brain with
   its orders list, *ride to* and *cruise*, steering round steep ground,
   getting up after crashes, and the 1/2 camera keys. He wanders the map.
2. **Free roam and jumps:** the free-roam behaviour (radius, every quarter),
   spotting jumps ahead, *take a jump*, appetite and cooldown, and the `ai`
   settings in the panel.

## Testing

The deciding parts are plain code with tests: the orders list (one at a
time, a new order can jump the queue, behaviours refill it), which jump
counts as ahead and his way, the appetite and cooldown, which quarter he
visits next, and the riding of each order on made-up hills with the real
bike physics (reaching a spot, holding cruise speed, taking a kicker,
turning away from a wall). In the game: watch him with the 2 key on a few
seeds, and measure how often he jumps, crashes or gets stuck.
