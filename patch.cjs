const fs = require('fs');
let code = fs.readFileSync('src/pages/SellerDashboard.tsx', 'utf8');

const regex = /\/\/ If listing still exists, update its status if needed[\s\S]*?if \(\(listingData\.quantity \|\| 0\) <= 0\) \{\s*transaction\.update\(listingRef, \{\s*status: 'SOLD',\s*updatedAt: serverTimestamp\(\)\s*\}\);\s*\}\s*\}\s*\}/;

const replacement = `// If listing still exists, update its status if needed
        if (listingDoc.exists()) {
          const listingData = listingDoc.data() as Listing;
          
          const deductionStatuses = ['SHIPPED', 'DEAL_DONE', 'READY_TO_TRANSFER', 'SOLD'];
          const isDeductingNow = deductionStatuses.includes(newStatus);
          const wasAlreadyDeducted = deductionStatuses.includes(order.status);
          
          if (isDeductingNow && !wasAlreadyDeducted) {
            const currentQuantity = listingData.quantity || 0;
            const newQuantity = Math.max(0, currentQuantity - (order.quantity || 1));
            
            transaction.update(listingRef, {
              quantity: newQuantity,
              status: newQuantity <= 0 ? 'SOLD' : listingData.status,
              updatedAt: serverTimestamp()
            });
          } else if (newStatus === 'SOLD' || newStatus === 'DEAL_DONE') {
            // Fallback for older orders where quantity was deducted at booking
            if ((listingData.quantity || 0) <= 0 && listingData.status !== 'SOLD') { 
               transaction.update(listingRef, { 
                 status: 'SOLD', 
                 updatedAt: serverTimestamp() 
               });
            }
          }
        }`;

if (regex.test(code)) {
  fs.writeFileSync('src/pages/SellerDashboard.tsx', code.replace(regex, replacement));
  console.log('patched');
} else {
  console.log('regex not matched');
}
