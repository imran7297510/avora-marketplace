const fs = require('fs');
let code = fs.readFileSync('src/pages/SellerDashboard.tsx', 'utf8');

const regex = /const orderRef = doc\(db, 'orders', order\.id\);\s*await updateDoc\(orderRef, \{\s*status: 'SHIPPED',\s*courierName: courierName,\s*trackingNumber: trackingNumber,\s*shippingNotes: shippingNotes,\s*updatedAt: serverTimestamp\(\)\s*\}\);/;

const replacement = `const orderRef = doc(db, 'orders', order.id);
      const listingRef = doc(db, 'listings', order.listingId);
      
      await runTransaction(db, async (transaction) => {
        const listingDoc = await transaction.get(listingRef);
        
        transaction.update(orderRef, {
          status: 'SHIPPED',
          courierName: courierName,
          trackingNumber: trackingNumber,
          shippingNotes: shippingNotes,
          updatedAt: serverTimestamp()
        });
        
        if (listingDoc.exists()) {
          const listingData = listingDoc.data() as Listing;
          const deductionStatuses = ['SHIPPED', 'DEAL_DONE', 'READY_TO_TRANSFER', 'SOLD'];
          const wasAlreadyDeducted = deductionStatuses.includes(order.status);
          
          if (!wasAlreadyDeducted) {
            const currentQuantity = listingData.quantity || 0;
            const newQuantity = Math.max(0, currentQuantity - (order.quantity || 1));
            transaction.update(listingRef, {
              quantity: newQuantity,
              status: newQuantity <= 0 ? 'SOLD' : listingData.status,
              updatedAt: serverTimestamp()
            });
          }
        }
      });`;

if (regex.test(code)) {
  fs.writeFileSync('src/pages/SellerDashboard.tsx', code.replace(regex, replacement));
  console.log('patched ship order');
} else {
  console.log('regex not matched');
}
