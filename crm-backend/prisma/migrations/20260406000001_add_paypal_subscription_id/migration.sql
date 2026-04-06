-- Add PayPal subscription ID to billing_info
ALTER TABLE "billing_info" ADD COLUMN "paypalSubscriptionId" TEXT;
CREATE UNIQUE INDEX "billing_info_paypalSubscriptionId_key" ON "billing_info"("paypalSubscriptionId");
