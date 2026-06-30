# Android Chrome QA Checklist

Device target: Galaxy Note 20 Ultra, Chrome, real logged-in manager account.

## Confirm Latest Build

1. Open FleetDesk production URL in Chrome.
2. Check the tiny `build ...` stamp near the lower-left of the screen.
3. Compare it with the latest deployed commit/build id from Vercel.
4. If the stamp does not match, open Chrome site settings for the domain and clear storage/cache, then reload.
5. Optional: connect remote debugging and confirm the console line: `[FleetDesk] build=<id> mode=production`.

## Contract Create

1. Open Contracts.
2. Tap New Contract.
3. Select a client.
4. Select an available vehicle.
5. Set start `22.06.2026 14:45`.
6. Set end `27.06.2026 14:45`.
7. Confirm availability text updates after date/time edits.
8. Set rate `300 AED/day`.
9. Confirm days = `5` and total = `AED 1,500`.
10. Add Delivery fee, confirm total updates, then remove it.
11. Set deposit `0`.
12. Tap Create Contract.
13. If availability fails, confirm the message is visible and tapping Create retries instead of staying disabled.

## Long Session / Overlay Recovery

1. Open and close client, vehicle, payment, close-contract, and select/dropdown dialogs repeatedly.
2. Background Chrome for 2 minutes, then return.
3. Confirm page scroll still works.
4. Confirm buttons and dropdowns respond to single taps.
5. Confirm no invisible overlay blocks the page after closing modals.

## Contract Detail

1. Open an active contract.
2. Add payment.
3. Confirm keyboard does not cover the submit button.
4. Confirm rent, Salik, fines, other charges, and deposit remain separate.
5. Open Close Contract.
6. Enter return date/time, mileage, fuel/status, and deposit action.
7. Confirm Close remains tappable and final balance/deposit summary is correct.

## Report

Record:

- Device model and Chrome version.
- Visible build id.
- Contract id used.
- Whether any tap required double-tap.
- Whether any modal/dropdown left the page unclickable.
- Any console warnings containing `[FleetDesk]`.
