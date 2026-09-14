# Configurable GST

Sales orders now support an editable GST percentage.

- The sales form defaults to 18% GST.
- Users can set any rate from 0% to 100% per sale.
- GST is calculated after line discounts and order discount.
- The final invoice total, customer receivable, and payment validation include GST.
- Sale details and printable invoices show subtotal, discounts, taxable amount, GST rate, GST amount, and grand total.
- API callers that omit `gstRate` remain at 0% for backward compatibility. The interactive MunshiOS sales form explicitly supplies the 18% default.
- Existing historical sales derive 0% GST because their stored total equals their post-discount taxable amount.

Purchase validation accepts a GST rate for forward compatibility, but purchase accounting and GRN posting remain unchanged in this batch. This prevents purchase inventory valuation and supplier payable logic from being changed without a dedicated accounting migration and full GRN lifecycle test pass.
