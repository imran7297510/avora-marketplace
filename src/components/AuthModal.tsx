import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  LogIn, 
  UserPlus, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Mail, 
  Lock, 
  User as UserIcon, 
  ShieldAlert,
  KeyRound,
  ArrowLeft,
  Check,
  RefreshCw
} from 'lucide-react';
import { checkUsernameUnique, normalizeUsername } from '../utils/username';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register' | 'forgot-password';
  isPage?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'login',
  isPage = false
}) => {
  const { 
    user,
    loginWithGoogle, 
    signUpWithEmailPassword, 
    signInWithUsernameOrEmail, 
    sendPasswordReset,
    sendVerificationEmail,
    authError,
    isIframe 
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot-password'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields - Login
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form fields - Register
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  // Forgot Password fields
  const [forgotEmail, setForgotEmail] = useState('');

  // Email verification resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [activeTab]);

  // Debounced Username Uniqueness Check
  useEffect(() => {
    if (activeTab !== 'register' || !regUsername) {
      setUsernameStatus('idle');
      return;
    }

    const normalized = normalizeUsername(regUsername);
    if (normalized.length < 3) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const isAvail = await checkUsernameUnique(normalized);
        setUsernameStatus(isAvail ? 'available' : 'taken');
      } catch (err) {
        setUsernameStatus('idle');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [regUsername, activeTab]);

  // Resend Email Cooldown Timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  if (!isOpen && !isPage) return null;

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-stone-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) || /[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score === 2 || score === 3) return { score: 2, label: 'Medium', color: 'bg-amber-500' };
    return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(regPassword);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage('Please enter your username/email and password.');
      return;
    }

    setLoading(true);
    try {
      await signInWithUsernameOrEmail(loginIdentifier.trim(), loginPassword);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!regName.trim() || !regUsername.trim() || !regEmail.trim() || !regPassword) {
      setErrorMessage('All fields are required.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (usernameStatus === 'taken') {
      setErrorMessage('This username is already taken. Please choose another.');
      return;
    }

    if (usernameStatus === 'invalid') {
      setErrorMessage('Username must be at least 3 alphanumeric characters.');
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmailPassword({
        name: regName.trim(),
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword
      });
      setSuccessMessage('Account created successfully! Verification email sent.');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordReset(forgotEmail.trim());
      setSuccessMessage('If an account is registered with this email address, password reset instructions have been sent. Please check your inbox.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Google login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    try {
      await sendVerificationEmail();
      setSuccessMessage('Verification email sent! Check your inbox.');
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend verification email.');
    }
  };

  const modalContent = (
    <div className={`bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl border border-stone-200/90 max-w-md w-full overflow-hidden flex flex-col my-auto ${isPage ? 'shadow-xl' : 'max-h-[92vh] sm:max-h-[90vh]'} animate-in fade-in zoom-in-95 transition-all`}>
      {/* Header Tabs */}
      <div className="relative bg-stone-900 text-white p-5 sm:p-6 pb-4 sm:pb-5 shrink-0">
        {!isPage && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-full transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 mb-1.5">
          <span className="bg-amber-500 text-stone-900 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
            Avora Identity
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter">
          {activeTab === 'login' && 'Welcome Back'}
          {activeTab === 'register' && 'Create Account'}
          {activeTab === 'forgot-password' && 'Reset Password'}
        </h2>
        <p className="text-[11px] sm:text-xs font-semibold text-stone-400 mt-0.5 sm:mt-1">
          {activeTab === 'login' && 'Sign in to access your listings, chats & deals'}
          {activeTab === 'register' && 'Join Avora peer-to-peer trading marketplace'}
          {activeTab === 'forgot-password' && 'Enter your email to receive password reset link'}
        </p>

        {/* Tab Switcher */}
        {activeTab !== 'forgot-password' && (
          <div className="flex bg-stone-800 p-1 rounded-xl mt-4 sm:mt-5 border border-stone-700/50">
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`flex-1 min-h-[40px] py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                activeTab === 'login' 
                  ? 'bg-amber-500 text-stone-900 shadow-md' 
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className={`flex-1 min-h-[40px] py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                activeTab === 'register' 
                  ? 'bg-amber-500 text-stone-900 shadow-md' 
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register
            </button>
          </div>
        )}
      </div>

      {/* Body Form - Scrollable */}
      <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto overscroll-contain">
        {/* Error Banner */}
        {(errorMessage || authError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 sm:p-3.5 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">
              {errorMessage || authError}
            </div>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 sm:p-3.5 text-xs flex items-start gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">
              {successMessage}
            </div>
          </div>
        )}

        {/* Sandbox Frame Notice */}
        {isIframe && (
          <div className="bg-amber-50/70 border border-amber-200 text-amber-800 rounded-xl p-2.5 sm:p-3 text-[11px] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Sandbox Notice: If Google popup is blocked, click "Open in New Tab" at top right.</span>
          </div>
        )}

        {/* ---------------- LOGIN TAB ---------------- */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3.5 sm:space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700 mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. john_trader or john@example.com"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-base sm:text-sm font-medium text-stone-900 transition-all outline-none"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setActiveTab('forgot-password')}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors cursor-pointer py-1"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 rounded-xl pl-10 pr-10 py-2.5 sm:py-3 text-base sm:text-sm font-medium text-stone-900 transition-all outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 cursor-pointer"
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] bg-stone-900 hover:bg-stone-800 text-white font-black py-3 sm:py-3.5 rounded-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                <LogIn className="w-4 h-4 text-amber-500" />
              )}
              <span>Log In</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-2.5 sm:my-3">
              <div className="border-t border-stone-200 w-full" />
              <span className="bg-white px-3 text-[10px] font-black uppercase tracking-widest text-stone-400 shrink-0">
                OR
              </span>
              <div className="border-t border-stone-200 w-full" />
            </div>

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full min-h-[46px] bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 font-bold py-2.5 sm:py-3 rounded-xl text-xs flex items-center justify-center gap-3 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}

        {/* ---------------- REGISTER TAB ---------------- */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="e.g. Muhammad Ali"
                className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700">
                  Username
                </label>
                {usernameStatus === 'checking' && (
                  <span className="text-[10px] text-stone-400 font-semibold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Checking...
                  </span>
                )}
                {usernameStatus === 'available' && (
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Available
                  </span>
                )}
                {usernameStatus === 'taken' && (
                  <span className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Username taken
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs">@</span>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="john_trader"
                  className={`w-full bg-stone-50 border ${
                    usernameStatus === 'taken' ? 'border-red-400 bg-red-50/20' : 
                    usernameStatus === 'available' ? 'border-emerald-400 bg-emerald-50/20' : 
                    'border-stone-200'
                  } focus:border-amber-500 focus:bg-white rounded-xl pl-8 pr-4 py-2.5 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl pl-10 pr-10 py-2.5 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 cursor-pointer"
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {regPassword && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 bg-stone-100 h-1.5 rounded-full overflow-hidden flex gap-1">
                    <div className={`h-full flex-1 ${strength.score >= 1 ? strength.color : 'bg-stone-200'}`} />
                    <div className={`h-full flex-1 ${strength.score >= 2 ? strength.color : 'bg-stone-200'}`} />
                    <div className={`h-full flex-1 ${strength.score >= 3 ? strength.color : 'bg-stone-200'}`} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showRegConfirmPassword ? 'text' : 'password'}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl pl-10 pr-10 py-2.5 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1.5 cursor-pointer"
                >
                  {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {regConfirmPassword && regPassword !== regConfirmPassword && (
                <p className="text-[10px] text-red-600 font-bold mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] bg-stone-900 hover:bg-stone-800 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer mt-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                <UserPlus className="w-4 h-4 text-amber-500" />
              )}
              <span>Create Account</span>
            </button>

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full min-h-[46px] bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-3 transition-all shadow-sm active:scale-95 cursor-pointer mt-1"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Quick Sign Up with Google</span>
            </button>
          </form>
        )}

        {/* ---------------- FORGOT PASSWORD TAB ---------------- */}
        {activeTab === 'forgot-password' && (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5 sm:space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700 mb-1.5">
                Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter registered email"
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-base sm:text-sm font-medium text-stone-900 outline-none transition-all"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] bg-stone-900 hover:bg-stone-800 text-white font-black py-3 sm:py-3.5 rounded-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                <KeyRound className="w-4 h-4 text-amber-500" />
              )}
              <span>Send Password Reset Email</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className="w-full min-h-[40px] text-stone-500 hover:text-stone-900 text-xs font-bold flex items-center justify-center gap-2 py-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center py-6 sm:py-10 px-3.5 sm:px-4 md:px-6 bg-stone-50/60 w-full">
        {modalContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3.5 sm:p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      {modalContent}
    </div>
  );
};
