# Parking PDF import manual test

1. Open **Fines & Salik** and confirm the tabs are **Traffic Fines**, **Salik Charges**, and **Parking**.
2. Open **Parking** and upload a Salik Monthly Statement PDF.
3. Confirm only rows whose transaction location contains `Parking` are imported; toll rows must remain untouched.
4. For `202512.pdf`, the parser must read 33 parking transactions totalling AED 1,497 before insertion.
5. Upload the same PDF again and confirm every row is skipped as a duplicate.
6. Confirm vehicles are matched by Salik tag first, then plate number.
7. Confirm parking inside a rental period is linked to that contract/client; unmatched rows remain visible as **Not linked**.
8. Confirm existing Fines Excel and Salik Excel imports still work unchanged.
