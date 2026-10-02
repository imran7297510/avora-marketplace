import re

with open('src/components/BadgeActivities.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Let's inspect each line range around Resubmit & Correction
cat1_start = -1
cat2_start = -1
cat3_start = -1

for idx, line in enumerate(lines):
    if '{/* Resubmit & Correction block */}' in line:
        if cat1_start == -1:
            cat1_start = idx
        elif cat2_start == -1:
            cat2_start = idx
        elif cat3_start == -1:
            cat3_start = idx

print(f"Indices: cat1={cat1_start}, cat2={cat2_start}, cat3={cat3_start}")

replacement_cat1 = """                                      {/* Rejected Application Closed Status */}
                                      {p.status === 'REJECTED' && (
                                        <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                              <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowApplyForm(true);
                                                setSuccess(false);
                                                setSelectedPlan(null);
                                                setProofImage('');
                                                setItemLink('');
                                                setSelectedListingId('');
                                                setAgreeToTerms(false);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                              }}
                                              className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                            >
                                              ✨ Apply Fresh
                                            </button>
                                          </div>
                                          {p.rejectionReason && (
                                            <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                              <span className="font-bold text-rose-900">Rejection Note: </span>
                                              {p.rejectionReason}
                                            </div>
                                          )}
                                          {p.rejectionCategory && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                              <span>Category:</span>
                                              <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                {p.rejectionCategory.replace('_', ' ')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
"""

replacement_cat2 = """                                        {/* Rejected Application Closed Status */}
                                        {p.status === 'REJECTED' && (
                                          <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                                <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setShowApplyForm(true);
                                                  setSuccess(false);
                                                  setSelectedPlan(null);
                                                  setProofImage('');
                                                  setItemLink('');
                                                  setSelectedListingId('');
                                                  setAgreeToTerms(false);
                                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                              >
                                                ✨ Apply Fresh
                                              </button>
                                            </div>
                                            {p.rejectionReason && (
                                              <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                                <span className="font-bold text-rose-900">Rejection Note: </span>
                                                {p.rejectionReason}
                                              </div>
                                            )}
                                            {p.rejectionCategory && (
                                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                                <span>Category:</span>
                                                <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                  {p.rejectionCategory.replace('_', ' ')}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}
"""

replacement_cat3 = """                                      {/* Rejected Application Closed Status */}
                                      {p.status === 'REJECTED' && (
                                        <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                              <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowApplyForm(true);
                                                setSuccess(false);
                                                setSelectedPlan(null);
                                                setProofImage('');
                                                setItemLink('');
                                                setSelectedListingId('');
                                                setAgreeToTerms(false);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                              }}
                                              className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                            >
                                              ✨ Apply Fresh
                                            </button>
                                          </div>
                                          {p.rejectionReason && (
                                            <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                              <span className="font-bold text-rose-900">Rejection Note: </span>
                                              {p.rejectionReason}
                                            </div>
                                          )}
                                          {p.rejectionCategory && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                              <span>Category:</span>
                                              <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                {p.rejectionCategory.replace('_', ' ')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
"""

# Let's find end of block for each (ends at `}` matching `!p.refundRequested`)
def find_block_end(start_idx):
    for i in range(start_idx, start_idx + 40):
        if lines[i].strip() == ')}':
            return i + 1
    return start_idx + 25

cat3_end = find_block_end(cat3_start)
cat2_end = find_block_end(cat2_start)
cat1_end = find_block_end(cat1_start)

print(f"Cat1: {cat1_start}..{cat1_end}")
print(f"Cat2: {cat2_start}..{cat2_end}")
print(f"Cat3: {cat3_start}..{cat3_end}")

# Replace in reverse order so indices remain valid
lines[cat3_start:cat3_end] = [replacement_cat3]
lines[cat2_start:cat2_end] = [replacement_cat2]
lines[cat1_start:cat1_end] = [replacement_cat1]

# Now let's update the refund button logic for the 3 categories
# Search for `p.refundStatus !== "REFUNDED" && p.amount && p.amount > 0`
full_text = "".join(lines)

# Also let's check for any other references to isEligibleForRefund and replace the button rendering
# Specifically:
# (!p.refundRequested && p.refundStatus !== "REFUNDED" && isEligibleForRefund(p))
# If rejected and not eligible, show Non-Refundable / Ineligible button!
old_btn_pattern = r'(\(!p\.refundRequested && p\.refundStatus !== "REFUNDED" && )p\.amount && p\.amount > 0(\) \?\s*\(\s*<div className="flex flex-col gap-1 w-full text-center">)'
new_full_text = re.sub(
    old_btn_pattern,
    r'\1isEligibleForRefund(p)\2',
    full_text
)

# Also replace the fallback REJECTED message:
# currently:
# p.status === 'REJECTED' ? (
#   <div className="w-full bg-amber-50 border border-amber-200/50 ... <span>⚠️ Claim Expired (7-Days)</span> </div>
# )
# Replace with clickable Non-Refundable / Ineligible button that alerts checkRefundEligibility reason!
old_claim_expired = r'p\.status === \'REJECTED\' \?\s*\(\s*<div className="w-full bg-amber-50[^>]+>.*?<span>⚠️ Claim Expired \(7-Days\)</span>.*?</div>\s*\)'

new_ineligible_button = """p.status === 'REJECTED' ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const check = checkRefundEligibility(p, user?.uid);
                                                alert(check.reason);
                                              }}
                                              className="w-full bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                              title="Click to see refund status details"
                                            >
                                              <AlertTriangle className="w-3.5 h-3.5 text-stone-500" />
                                              <span>Non-Refundable / Ineligible</span>
                                            </button>
                                          )"""

new_full_text = re.sub(old_claim_expired, new_ineligible_button, new_full_text, flags=re.DOTALL)

with open('src/components/BadgeActivities.tsx', 'w', encoding='utf-8') as f:
    f.write(new_full_text)

print("Replacement complete.")
