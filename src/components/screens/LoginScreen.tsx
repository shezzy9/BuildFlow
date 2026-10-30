import React, { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  UserPlus,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { MaterialShowroom3D } from '../three/MaterialShowroom3D';
import { Button, Dialog, Input, Select } from '../ui/Primitives';
import { UserRole } from '../../types';

export const LoginScreen: React.FC = () => {
  const {
    setScreen,
    loginWithCredentials,
    registerAccount,
    resetPasswordWithEmail,
    loginWithGoogle,
  } = useStore();

  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');

  // Sign-In state
  const [identity, setIdentity] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // Registration state
  const [regName, setRegName] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regBusinessName, setRegBusinessName] = useState<string>('');
  const [regRole, setRegRole] = useState<UserRole>('Admin');
  const [regDepartment, setRegDepartment] = useState<string>('Executive & Yard Operations');
  const [regPassword, setRegPassword] = useState<string>('');
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Real Password Reset dialog state
  const [forgotOpen, setForgotOpen] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetError, setResetError] = useState<string>('');
  const [resetSuccess, setResetSuccess] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identity.trim()) {
      setErrorMessage('Please enter your registered work email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Please enter your password (minimum 6 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginWithCredentials(identity, password, rememberMe);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!regName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await registerAccount({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phone: regPhone.trim() || '+91 80 4120 9900',
        role: regRole,
        department: regDepartment.trim() || 'Executive & Yard Operations',
        businessName: regBusinessName.trim() || undefined,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked by the browser.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setResetError('Please enter your registered workspace email address.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }
    setResetting(true);
    try {
      await resetPasswordWithEmail(trimmedEmail, resetNewPassword);
      setResetSuccess(true);
      setIdentity(trimmedEmail);
      setPassword(resetNewPassword);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#252923] flex flex-col">
      {/* Top Minimal Bar */}
      <header className="border-b border-[#E7E4DC] bg-[#FFFFFF]">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setScreen('landing')}
            className="text-lg font-bold tracking-tight text-[#252923] font-display cursor-pointer"
          >
            BuildFlow Supply
          </button>

          <button
            type="button"
            onClick={() => setScreen('landing')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#777A73] hover:text-[#252923] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Showroom</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-10 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          {/* Left Column: Real Authentication Panel */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="bg-[#FFFFFF] border border-[#E7E4DC] p-7 sm:p-9">
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 p-1 bg-[#F7F6F2] border border-[#E7E4DC] mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMessage('');
                  }}
                  className={`py-2 text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'signin'
                      ? 'bg-[#315744] text-white'
                      : 'text-[#777A73] hover:text-[#252923]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage('');
                  }}
                  className={`py-2 text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-[#315744] text-white'
                      : 'text-[#777A73] hover:text-[#252923]'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div className="text-xs font-mono text-[#315744] mb-1.5">
                {authMode === 'signin'
                  ? 'WORKSPACE AUTHENTICATION'
                  : 'NEW YARD & SUPPLY REGISTRATION'}
              </div>
              <h1 className="text-2xl font-bold text-[#252923] font-display tracking-tight">
                {authMode === 'signin'
                  ? 'Sign in to BuildFlow Supply'
                  : 'Create your workspace account'}
              </h1>
              <p className="text-xs text-[#777A73] mt-1.5 leading-relaxed">
                {authMode === 'signin'
                  ? 'Enter your registered credentials to manage live inventory ledgers, supplier POs, and GST invoices.'
                  : 'Register your building material supply business with a dedicated role-based account.'}
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-4 p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]"
                >
                  {errorMessage}
                </div>
              )}

              {authMode === 'signin' ? (
                <form onSubmit={handleSignInSubmit} className="mt-5 space-y-4" noValidate>
                  <Input
                    label="Work Email Address"
                    type="email"
                    name="identity"
                    placeholder="you@yourcompany.com"
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    autoComplete="username"
                    required
                  />

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login_password"
                        className="text-xs font-medium text-[#252923]"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetSuccess(false);
                          setResetError('');
                          setResetEmail(identity);
                          setResetNewPassword('');
                          setForgotOpen(true);
                        }}
                        className="text-xs text-[#315744] hover:underline cursor-pointer"
                      >
                        Reset password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login_password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="w-full px-3 py-2 pr-10 text-sm bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777A73] hover:text-[#252923] p-1 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-[#252923] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="accent-[#315744]"
                      />
                      <span>Keep me signed in on this terminal</span>
                    </label>
                  </div>

                  <div className="pt-1">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      <Lock className="w-4 h-4" />
                      <span>{isSubmitting ? 'Signing In...' : 'Sign In to Workspace'}</span>
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-3.5" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Input
                      label="Your Full Name"
                      placeholder="e.g., Aarav Sharma"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                    />
                    <Input
                      label="Work Email Address"
                      type="email"
                      placeholder="name@company.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Input
                      label="Business / Supply Yard Name"
                      placeholder="e.g., Apex Building Materials"
                      value={regBusinessName}
                      onChange={(e) => setRegBusinessName(e.target.value)}
                    />
                    <Input
                      label="Phone Number"
                      placeholder="+91 98450 12345"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <Select
                      label="Operational Role"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as UserRole)}
                      options={[
                        { value: 'Admin', label: 'Admin (Full Access)' },
                        { value: 'Store Manager', label: 'Store Manager' },
                        { value: 'Inventory Clerk', label: 'Inventory Clerk' },
                        { value: 'Billing Executive', label: 'Billing Executive' },
                      ]}
                    />
                    <Input
                      label="Department / Division"
                      placeholder="Executive & Yard Operations"
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="register_password"
                      className="text-xs font-medium text-[#252923]"
                    >
                      Create Password (min. 6 characters)
                    </label>
                    <div className="relative">
                      <input
                        id="register_password"
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        className="w-full px-3 py-2 pr-10 text-sm bg-[#FFFFFF] text-[#252923] border border-[#E7E4DC] focus:outline-none focus:border-[#315744]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777A73] hover:text-[#252923] p-1 cursor-pointer"
                      >
                        {showRegPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {isSubmitting ? 'Creating Workspace...' : 'Create Account & Enter Workspace'}
                      </span>
                    </Button>
                  </div>
                </form>
              )}

              <div className="relative my-5 flex items-center justify-center">
                <div className="border-t border-[#E7E4DC] w-full" />
                <span className="bg-[#FFFFFF] px-3 text-[11px] font-mono text-[#777A73] uppercase">
                  or
                </span>
                <div className="border-t border-[#E7E4DC] w-full" />
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
              >
                <ShieldCheck className="w-4 h-4 text-[#315744]" />
                <span>Continue with Google Account</span>
              </Button>

              <div className="mt-5 pt-4 border-t border-[#E7E4DC] flex items-center justify-between text-xs text-[#777A73]">
                <span>
                  {authMode === 'signin'
                    ? 'New to BuildFlow Supply?'
                    : 'Already have a workspace account?'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'signin' ? 'register' : 'signin');
                    setErrorMessage('');
                  }}
                  className="font-semibold text-[#315744] hover:underline cursor-pointer"
                >
                  {authMode === 'signin' ? 'Create an account →' : 'Sign in instead →'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Quiet 3D Material Composition & Security Architecture */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-[#FFFFFF] border border-[#E7E4DC] p-6">
            <div className="flex-1 min-h-[380px] flex flex-col">
              <MaterialShowroom3D variant="login" />
            </div>
            <div className="pt-4 mt-4 border-t border-[#E7E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#777A73]">
              <span className="font-medium text-[#252923] inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#315744]" />
                <span>BuildFlow Supply · Persistent Inventory & GST Billing Ledger</span>
              </span>
              <span className="font-mono text-[11px]">
                BCRYPT HASHED AUTH · JWT SESSIONS · REAL-TIME DB
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Real Password Reset Modal */}
      <Dialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset Workspace Password"
        subtitle="Update the password for your registered workspace email in the database."
      >
        {resetSuccess ? (
          <div className="space-y-4">
            <div className="p-4 bg-[#EDF3F0] border border-[#315744]/30 text-xs text-[#252923] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#315744] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Password updated in database</div>
                <p className="text-[#777A73] mt-0.5">
                  The password for <span className="font-mono text-[#252923]">{resetEmail}</span> has
                  been updated. Your new credentials have been filled into the Sign In form.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={() => setForgotOpen(false)}
              >
                Continue to Sign In
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>
            {resetError && (
              <div className="p-3 bg-[#FDF3F1] border border-[#BD704F] text-xs text-[#9E3B24]">
                {resetError}
              </div>
            )}
            <Input
              label="Registered Work Email"
              type="email"
              placeholder="you@yourcompany.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <Input
              label="New Password (minimum 6 characters)"
              type="password"
              placeholder="Enter new password"
              value={resetNewPassword}
              onChange={(e) => setResetNewPassword(e.target.value)}
              required
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setForgotOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={resetting}>
                {resetting ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
