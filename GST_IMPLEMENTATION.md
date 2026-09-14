# Configurable GST

Sales orders now support an editable GST percentage.

- The sales form defaults to 18% GST.
- Users can set any rate from 0% to 100% per sale.
- GST is calculated after line discounts and order discount.
- The final invoice total, customer receivable, and payment validation include GST.
- Sale details and printable invoices show subtotal, discounts, taxable amount, GST rate, GST amount, and grand total.
- API callers that omit `gstRate` remain at 0% for backward compatibility. The interactive MunshiOS sales form explicitly supplies the 18% default.
- Existing historical sales derive 0% GST because their stored total equals their post-discount taxable amount.

Purchase orders and GRN accounting are intentionally unchanged in this batch. Purchase GST should be introduced separately so inventory valuation, supplier payables, supplier returns, GRN edits, cancellations, and reversals change together and remain financially consistent.
