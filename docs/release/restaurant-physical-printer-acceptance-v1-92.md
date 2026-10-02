# Physical printer acceptance V1.92

Status: **NOT EXECUTED — HARDWARE VALIDATION REQUIRED**. Browser/PDF evidence cannot fill these fields. Use synthetic approved staging orders only.

Operator/date: ______  Frozen release SHA: ______  Staging URL/workspace: ______

Customer printer model/serial/connection: ______  KOT printer model/serial/connection: ______

OS/browser/driver versions: ______  Paper: ______  Scaling/margins: ______

For each row record PASS or FAIL after physical execution, printed order/reference and evidence/photo, and any defect/retest. Blank means pending. N/A requires an explicit approved scope reason and does not certify that feature.

| Case | Device | Expected observation | PASS / FAIL | Evidence / issue / retest |
| --- | --- | --- | --- | --- |
| Short receipt | Customer | Header/items/totals/payment and order reference readable | ____ | ____ |
| Very long receipt (30+ lines) | Customer | All lines/totals printed, no cut-off/overlap or unreadable shrink | ____ | ____ |
| Long item name | Both | Wrapping preserves label; no overlap with quantities/prices | ____ | ____ |
| Quantity/price alignment | Customer | Fractional quantity, unit price and totals align and reconcile | ____ | ____ |
| Manager-approved discount | Customer | Correct discount and net total match historical receipt | ____ | ____ |
| Manager-approved tax | Customer | Correct tax and net total; no fiscal certification implication | ____ | ____ |
| Partial then final payment | Customer | Received/outstanding and payment history correct on each print | ____ | ____ |
| Supported return/refund/reversal | Customer | Compensation/history and net due reconcile; originals retained | ____ | ____ |
| Cancelled receipt | Customer | Cancellation conspicuous, no live-sale implication | ____ | ____ |
| Receipt/KOT reprint after menu rename | Both | Original item snapshot/reference retained, no new financial effects | ____ | ____ |
| KOT modifiers | KOT | All modifiers visible with correct item/quantity | ____ | ____ |
| KOT item/order notes | KOT | Notes legible, associated with correct item/order | ____ | ____ |
| Urdu/Unicode where required | Both | Expected shaping/glyphs readable on intended driver/device | ____ | ____ |
| 80mm paper width | Both | Correct physical width and legible minimum text size | ____ | ____ |
| Margins / scaling | Both | No horizontal clipping, correct paper setting and scale | ____ | ____ |
| Feed | Both | Correct feed, no omitted trailing totals/notes | ____ | ____ |
| Cutter (if fitted) | Both | Cut after complete document, no text cut | ____ | ____ |
| Device routing | Both | Receipt to customer device, KOT to kitchen, no cross-route | ____ | ____ |
| Offline / paper-out / repeated print | Both | Recoverable operator error; intentional reprint preserves identity, no duplicate sale | ____ | ____ |

Accepted customer device: ____  Accepted kitchen device: ____  Operator sign-off/date: ____

Open hardware blockers: ____  Retest owner/date: ____

Both required devices and every applicable row must pass before hardware acceptance. Automatic WhatsApp, Restaurant email/SMS and FBR fiscal output are excluded from this proposed release.
