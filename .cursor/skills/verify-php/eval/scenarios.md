# verify-php scenarios

Drive these in one fresh offline-demo session, in this order. Reset the demo store first. The shutter ignores clicks for about 1.1 seconds while it reads a plate, so pause between captures. Open `/` to change roles. The phone tab bar can cover **All apps** after the page scrolls.

| id | Pass when |
| --- | --- |
| `doctor-offline` | After reset, doctor reports `"offlineDemo": true`. |
| `launcher-open` | **One home, four apps** and **OFFLINE DEMO** are visible. |
| `launcher-theme` | **Dark mode** switches the control to **Light mode**, and switching back shows **Dark mode**. |
| `signin-redirect` | Opening `/login` returns to `/` and shows **One home, four apps**. |
| `signup-redirect` | Opening `/signup` shows the launcher and **OFFLINE DEMO**. |
| `onboard-welcome` | The homeowner card shows **Set up my home**. |
| `onboard-address` | **YOUR NAME**, **SERVICE ADDRESS**, and **Inside our service area** are visible. The typed values sit in the fields. |
| `onboard-scan` | Five shutter presses show **All 5 appliances found**. |
| `onboard-research` | **Build my plan** reaches **100%**. |
| `onboard-tier` | **Start PHP Recommended** opens `/homeowner/home`. |
| `home-next` | **NEXT VISIT** is visible. |
| `home-confirm` | **Confirm** becomes **Confirmed**. |
| `plan-open` | The Plan tab shows **Your plan**, **Your year of care**, and a `/mo` price. |
| `plan-change` | **Change coverage ›** shows **Done**, and **Done** returns to **Your plan**. |
| `reports-empty` | Before the technician finishes, Reports shows **Your first report arrives after the visit**. |
| `services-lines` | Services shows **Something not right?**, **Roofing** on Contracted, and **Lawn care** on Maintenance. |
| `request-show` | A Show us note for the kitchen, urgency soon, returns to Services with **Sent**. |
| `tech-finish` | The technician opens the stop, arrives, checks every task, and sees **Report sent ✓**. |
| `reports-detail` | The homeowner report card shows **Visit report** and **Home health**. |
| `vendor-bid` | After **Get quotes** on lawn care, the vendor submits and sees **Quote sent**. |
| `office-pricing` | **Tier pricing** is open and **Increase** changes the page text. |
| `office-dispatch` | **Send 48-hr reminders** becomes **48-hr reminders sent ✓**. |
| `office-quotes` | **Add-on quotes** and **Coordination fees** are visible. |
| `office-requests` | The Projects filter shows **Pool resurfacing** and **Roof inspection after the last storm**. |
