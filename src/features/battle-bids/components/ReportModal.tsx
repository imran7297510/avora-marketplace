import React, { useState } from 'react';
import { ArenaModal } from './shared/ArenaModal';
import { ReportReasonSelector } from './ReportReasonSelector';
import { ReportReason, ReportTargetType } from '../types';
import { ArenaButton } from './ArenaButton';
import { useReport } from '../hooks/useReport';
import { ShieldAlert, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: ReportTargetType;
  targetTitle?: string;
  targetOwnerId?: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetId,
  targetType,
  targetTitle,
  targetOwnerId
}) => {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { submitReport, submitting, error } = useReport();

  const handlePreSubmit = () => {
    if (!reason) return;
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await submitReport(targetId, targetType, reason, description, targetOwnerId);
      setSuccess(true);
      setShowConfirm(false);
    } catch (err) {
      console.error('Report submission failed', err);
      setShowConfirm(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setShowConfirm(false);
    setReason(null);
    setDescription('');
    onClose();
  };

  return (
    <ArenaModal 
      isOpen={isOpen} 
      onClose={handleClose}
      title={success ? "Report Dispatched" : `Secure Reporting: ${targetType}`}
    >
      <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
        {success ? (
          <div className="text-center space-y-4 sm:space-y-6 py-4 sm:py-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tighter">Strategic Report Logged</h3>
              <p className="text-stone-400 text-xs sm:text-sm font-medium leading-relaxed max-w-xs mx-auto">
                Your report has been securely transmitted to the Arena Moderation Floor. Our tactical team will review the movement shortly.
              </p>
            </div>
            <ArenaButton variant="primary" onClick={handleClose} className="w-full text-xs sm:text-sm">
              Return to Combat
            </ArenaButton>
          </div>
        ) : showConfirm ? (
          <div className="text-center space-y-4 sm:space-y-6 py-4 sm:py-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tighter">Are you sure?</h3>
              <p className="text-stone-400 text-xs sm:text-sm font-medium leading-relaxed max-w-xs mx-auto">
                You are about to report this {targetType}. This action will be reviewed by the administrative moderation team.
              </p>
            </div>
            <div className="flex gap-3">
              <ArenaButton variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting} className="flex-1 text-xs sm:text-sm">
                Cancel
              </ArenaButton>
              <ArenaButton 
                variant="primary" 
                onClick={handleSubmit} 
                disabled={submitting}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white border-none shadow-lg shadow-rose-500/20 text-xs sm:text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...
                  </>
                ) : 'Confirm & Submit'}
              </ArenaButton>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-5 bg-stone-900 border border-amber-500/20 rounded-2xl sm:rounded-[2rem] flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-stone-950 border border-white/5 rounded-xl flex items-center justify-center text-amber-500 shadow-inner shrink-0">
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-0.5">Target Assessment</p>
                <p className="text-xs sm:text-sm font-black text-white uppercase truncate italic">{targetTitle || targetId}</p>
              </div>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              <h4 className="text-[10px] sm:text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-2">Select Tactical Violation</h4>
              <ReportReasonSelector selectedReason={reason} onSelect={setReason} />
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              <h4 className="text-[10px] sm:text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-2">
                Operational Briefing {reason === ReportReason.OTHER && <span className="text-rose-500">(Required)</span>}
              </h4>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide detailed intelligence on the violation..."
                rows={3}
                className="w-full bg-stone-950 border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-white font-medium text-xs sm:text-sm placeholder:text-stone-700 focus:border-amber-500/50 outline-none transition-all resize-none shadow-inner"
              />
            </div>

            {error && (
              <div className="p-3 sm:p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl sm:rounded-2xl flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500 shrink-0" />
                <p className="text-[10px] sm:text-xs font-black text-rose-500 uppercase tracking-widest leading-relaxed">
                  {error}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <ArenaButton variant="outline" onClick={handleClose} className="flex-1 text-xs sm:text-sm">
                Abort
              </ArenaButton>
              <ArenaButton 
                variant="primary" 
                onClick={handlePreSubmit} 
                disabled={!reason || (reason === ReportReason.OTHER && !description)}
                className="flex-1 bg-amber-500 text-stone-955 border-none shadow-lg shadow-amber-500/20 text-xs sm:text-sm"
              >
                Submit Intel
              </ArenaButton>
            </div>
          </>
        )}
      </div>
    </ArenaModal>
  );
};
