# Vehicle timeline correction

Scope:
- Add an edit action inside each expanded vehicle timeline item.
- Allow correcting the segment boundary date/time and daily rate.
- Keep adjacent vehicle boundaries continuous.
- Block corrections that overlap another contract for the same vehicle.

Manual checks:
1. Open a contract with at least one replacement.
2. Expand each vehicle segment and verify the edit action is visible.
3. Correct a replacement boundary and confirm both adjacent segments stay continuous.
4. Try an invalid reversed range and confirm saving is blocked.
5. Try a date that overlaps another contract for the same car and confirm saving is blocked.
6. Reopen the timeline and confirm days and AED totals are recalculated.
