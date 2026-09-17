-- ============================================================================
-- 1.36.0 (revizija #10, 19-f-3 P2): denarni zapisi preživijo brisanje Owner-ja
-- ============================================================================
-- Sponsorship.owner in CommissionInvoice.owner sta bila onDelete: Cascade —
-- brisanje Owner-ja bi pobrisalo plačana sponzorstva (stripePaymentId) in
-- izdane/plačane provizijske račune. Računovodski zapisi morajo preživeti
-- (retention); GDPR izbris Owner-ja = anonymizacija, ne brisanje.
-- Danes Owner-delete endpoint ne obstaja (varovalka za prihodnje).

ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_ownerId_fkey";
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionInvoice" DROP CONSTRAINT "CommissionInvoice_ownerId_fkey";
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
