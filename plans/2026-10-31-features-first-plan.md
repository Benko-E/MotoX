# MotoX: features first plan

After a deep audit of the jump system (three audits plus checks, see the
conversation of 2026-10-31), the user decided: the finder that searches the
whole map for jumps goes. Jumps come only from map features, which gives far
more control, and as features are added the hills fill up anyway. Debugging
and tuning by eye are a big part of the fun, so features get settings and
debug views, and the tuning panel gets reorganised so new features slot in.

## The parts, in order (stop after each for the user to try it)

1. **Clean-up.**
   - Remove the jump finder (searching the hills). Jumps are the ones map
     features build; each measures its own flight the way the finder did
     (take-off where the ground bends away, then the flight).
   - The pink lanes stay as a debug view, showing every feature-built jump.
   - Letters off by default for now (they move into big air later); no
     placing while they're hidden.
   - Helga's bugs from the audit: after a jump the old order resumed behind
     him (the U-turns, every kicker taken twice, crashes in free roam);
     a bump counted as the jump; turning back to an approach point he'd
     passed; two separate settings for the track's direction; free roam
     heading for a quarter behind him; a "no" to a jump remembered forever.
   - Refresh bugs and leftovers: jumps cleared on a map change, dead code
     (Wander, the panel's "last name only" notes), duplicated helpers.
2. **The tuning panel reworked**: grouped and collapsed, a folder per
   map feature (settings + its debug view), riders as a list where each has
   a job and only that job's settings show; ready for ridges and the rest.
3. **The track** (renamed from channel): a debug view on the map showing
   its width, banks and kickers (later checkpoints).
4. **Hills affect speed**: gravity along the slope slows you uphill and
   speeds you downhill (a setting for how much); today speed is set by the
   throttle alone.
5. **Helga rides like a person**: easing off for bends, winding up for
   kickers, flat out on straights, from what the track knows about itself.
6. **Big air**: a big natural kicker in the hills for 3+ s of air; the
   letters become part of it.
