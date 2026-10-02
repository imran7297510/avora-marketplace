import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  ShieldCheck, 
  KeyRound, 
  Mail, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Eye, 
  EyeOff, 
  RefreshCw,
  PlusCircle
} from 'lucide-react';

interface AccountSecurityCardProps {
  user: User;
  linkPasswordAccount: (password: string) => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
}

export const AccountSecurityCard: React.FC<AccountSecurityCardProps> = ({
  user,
  linkPasswordAccount,
  linkGoogleAccount,
  sendVerificationEmail
}) => {
  const [showAddPasswordModal, setShowAddPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const hasGoogle = user?.providerData?.some(p => p.providerId === 'google.com');
  const hasPassword = user?.providerData?.some(p => p.providerId === 'password');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await linkPasswordAccount(newPassword);
      setSuccessMsg('Password login enabled successfully!');
      setShowAddPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add password credential.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await linkGoogleAccount();
      setSuccessMsg('Google account linked successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to link Google account.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await sendVerificationEmail();
      setSuccessMsg('Verification email sent! Check your inbox.');
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification email.');
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-stone-100 shadow-sm relative overflow-hidden mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-2xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-stone-900 uppercase italic tracking-tighter">
              Account Security & Sign-In Methods
            </h3>
            <p className="text-xs text-stone-400 font-semibold">
              Manage your connected authentication providers and credentials
            </p>
          </div>
        </div>
      </div>

      {/* Banners */}
      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google Authentication Status */}
        <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <div>
              <p className="text-xs font-black text-stone-900 uppercase tracking-wider">Google Authentication</p>
              <p className="text-[11px] text-stone-500">
                {hasGoogle ? 'Google Account Connected' : 'Google Account Not Linked'}
              </p>
            </div>
          </div>
          {hasGoogle ? (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          ) : (
            <button
              onClick={handleLinkGoogle}
              disabled={loading}
              className="bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all"
            >
              <PlusCircle className="w-3 h-3 text-amber-500" /> Link
            </button>
          )}
        </div>

        {/* Password Authentication Status */}
        <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-stone-700 shrink-0" />
            <div>
              <p className="text-xs font-black text-stone-900 uppercase tracking-wider">Password Login</p>
              <p className="text-[11px] text-stone-500">
                {hasPassword ? 'Password Credential Enabled' : 'No Password Set'}
              </p>
            </div>
          </div>
          {hasPassword ? (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Enabled
            </span>
          ) : (
            <button
              onClick={() => setShowAddPasswordModal(true)}
              className="bg-amber-500 hover:bg-amber-600 text-stone-900 text-[10px] font-black uppercase px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-sm"
            >
              <PlusCircle className="w-3 h-3" /> Add Password
            </button>
          )}
        </div>

        {/* Email Verification Status */}
        <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl flex items-center justify-between md:col-span-2">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-stone-700 shrink-0" />
            <div>
              <p className="text-xs font-black text-stone-900 uppercase tracking-wider">Email Verification</p>
              <p className="text-[11px] text-stone-500">{user.email}</p>
            </div>
          </div>
          {user.emailVerified ? (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Verified
            </span>
          ) : (
            <button
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 text-amber-500 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
              <span>{resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Verification'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Password Modal */}
      {showAddPasswordModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[2rem] p-6 max-w-sm w-full border border-stone-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black uppercase italic text-stone-900">
                Add Password Login
              </h4>
              <button 
                onClick={() => setShowAddPasswordModal(false)}
                className="p-1 hover:bg-stone-100 rounded-full"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              Set a password so you can sign in with your email or username without using Google.
            </p>

            <form onSubmit={handleAddPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-9 py-2 text-xs font-medium outline-none focus:border-amber-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-9 py-2 text-xs font-medium outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-stone-900 text-white font-black py-2.5 rounded-xl uppercase text-xs tracking-wider hover:bg-stone-800 transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" /> : null}
                  <span>Save Password</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPasswordModal(false)}
                  className="px-4 bg-stone-100 text-stone-600 font-bold py-2.5 rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
