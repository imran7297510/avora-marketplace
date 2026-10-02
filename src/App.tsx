/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { SubmitListing } from './pages/SubmitListing';
import { Listings } from './pages/Listings';
import { ListingDetails } from './pages/ListingDetails';
import { Messages } from './pages/Messages';
import { SellerDashboard } from './pages/SellerDashboard';
import { CompletedOrders } from './pages/CompletedOrders';
import { Disclaimer } from './pages/Disclaimer';
import { Contact } from './pages/Contact';
import { Admin } from './pages/Admin';
import { AdminPromotions } from './pages/AdminPromotions';
import { AdminVerifications } from './pages/AdminVerifications';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NegotiationProvider } from './features/battle-bids/context/NegotiationContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { CreditsProvider, CreditLedgerModal, CreditPurchaseModal } from './features/credits';
import { KYCVerification } from './pages/KYCVerification';
import { Profile } from './pages/Profile';

import { FAQs } from './pages/FAQs';
import { Support } from './pages/Support';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import { WhyUs } from './pages/WhyUs';
import { VerifiedProfiles } from './pages/VerifiedProfiles';
import { PremiumSellerSearch } from './pages/PremiumSellerSearch';
import { PremiumPage } from './pages/PremiumPage';
import { FeaturedPage } from './pages/FeaturedPage';
import { BoostsPage } from './pages/BoostsPage';
import { CreditsPage } from './pages/CreditsPage';
import { PublicProfile } from './pages/PublicProfile';
import { ScrollToTop } from './components/ScrollToTop';
import { PriceDrops } from './pages/PriceDrops';
import { AuthModal } from './components/AuthModal';
import { ArenaHome } from './pages/battle-bids/ArenaHome';

// Battle Bids Arena Sub-Pages - Lazy Loaded
const ArenaLeaderboard = lazy(() => import('./pages/battle-bids/ArenaLeaderboard').then(m => ({ default: m.ArenaLeaderboard })));
const ArenaHistory = lazy(() => import('./pages/battle-bids/ArenaHistory').then(m => ({ default: m.ArenaHistory })));
const ArenaCreateAuction = lazy(() => import('./pages/battle-bids/ArenaCreateAuction').then(m => ({ default: m.ArenaCreateAuction })));
const ArenaMyAuctions = lazy(() => import('./pages/battle-bids/ArenaMyAuctions').then(m => ({ default: m.ArenaMyAuctions })));
const ArenaWatchlist = lazy(() => import('./pages/battle-bids/ArenaWatchlist').then(m => ({ default: m.ArenaWatchlist })));
const ArenaExplore = lazy(() => import('./pages/battle-bids/ArenaExplore').then(m => ({ default: m.ArenaExplore })));
const ArenaNegotiations = lazy(() => import('./pages/battle-bids/ArenaNegotiations').then(m => ({ default: m.ArenaNegotiations })));
const ArenaNegotiationView = lazy(() => import('./pages/battle-bids/ArenaNegotiationView').then(m => ({ default: m.ArenaNegotiationView })));
const ArenaModeration = lazy(() => import('./pages/battle-bids/ArenaModeration').then(m => ({ default: m.ArenaModeration })));
const ArenaProfile = lazy(() => import('./pages/battle-bids/ArenaProfile').then(m => ({ default: m.ArenaProfile })));
const ArenaMyProfile = lazy(() => import('./pages/battle-bids/ArenaMyProfile').then(m => ({ default: m.ArenaMyProfile })));
const ArenaAuctionAnalytics = lazy(() => import('./pages/battle-bids/ArenaAuctionAnalytics').then(m => ({ default: m.ArenaAuctionAnalytics })));
const ArenaBattleTimeline = lazy(() => import('./pages/battle-bids/ArenaBattleTimeline').then(m => ({ default: m.ArenaBattleTimeline })));
const BattleBidsCheckout = lazy(() => import('./pages/battle-bids/BattleBidsCheckout').then(m => ({ default: m.BattleBidsCheckout })));

const ArenaHomeSkeleton = () => (
  <div className="min-h-screen bg-stone-955 text-white max-w-5xl mx-auto px-2 py-2 md:px-3 md:py-4 space-y-4 md:space-y-6 animate-pulse">
    <div className="flex flex-row items-center gap-3 w-full">
      <div className="h-11 bg-stone-900 border border-stone-850 rounded-2xl flex-1 sm:flex-initial sm:w-28" />
      <div className="h-11 bg-stone-900 border border-stone-850 rounded-2xl flex-1" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      <div className="h-11 bg-amber-500/20 border border-amber-500/30 rounded-2xl w-full" />
      <div className="h-11 bg-stone-900 border border-stone-850 rounded-2xl w-full" />
    </div>
    <div className="space-y-4 bg-stone-900/40 p-4 md:p-8 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem]">
      <div className="h-4 w-40 bg-stone-800 rounded" />
      <div className="p-5 bg-stone-950 border border-stone-850 rounded-[2rem] h-24 w-full max-w-md" />
      <div className="aspect-[16/9] sm:aspect-[21/9] w-full rounded-[2.5rem] bg-stone-850" />
      <div className="h-7 w-2/3 bg-stone-850 rounded-xl" />
    </div>
  </div>
);

const RedirectToNegotiation = () => {
  const { negId } = useParams();
  return <Navigate to={`/negotiations/timeline/${negId}`} replace />;
};

const RedirectToAuction = () => {
  const { auctionId } = useParams();
  return <Navigate to={`/battle-bids?id=${auctionId}`} replace />;
};

const RedirectToArenaProfile = () => {
  const { id } = useParams();
  return <Navigate to={`/battle-bids/profile/${id}`} replace />;
};

const RedirectToSellrDashboard = () => {
  const location = useLocation();
  return <Navigate to={{ pathname: '/sellr-dashboard', search: location.search }} replace />;
};

const ArenaCreateAuctionWrapper = () => {
  const location = useLocation();
  if (new URLSearchParams(location.search).get('type') === 'negotiation') {
    return <Navigate to="/negotiations/create" replace />;
  }
  return <ArenaCreateAuction />;
};

const LoginPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  return <AuthModal isOpen={true} isPage={true} initialTab="login" onClose={() => navigate('/')} />;
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  return <AuthModal isOpen={true} isPage={true} initialTab="register" onClose={() => navigate('/')} />;
};

export default function App() {
  React.useEffect(() => {
    // Prefetch ArenaHome in background
    import('./pages/battle-bids/ArenaHome').catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <CurrencyProvider>
        <NegotiationProvider>
          <CreditsProvider>
            <BrowserRouter>
              <ScrollToTop />
              <CreditLedgerModal />
              <CreditPurchaseModal />
              <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="submit" element={<SubmitListing />} />
            <Route path="listings" element={<Listings />} />
            <Route path="listings/:id" element={<ListingDetails />} />
            <Route path="listing/:slug" element={<ListingDetails />} />
            <Route path="price-drops" element={<PriceDrops />} />
            <Route path="battle-bids">
              <Route index element={<ArenaHome />} />
              <Route path="leaderboard" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaLeaderboard /></Suspense>} />
              <Route path="history" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaHistory /></Suspense>} />
              <Route path="create" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaCreateAuctionWrapper /></Suspense>} />
              <Route path="explore" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaExplore /></Suspense>} />
              <Route path="my-auctions" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaMyAuctions /></Suspense>} />
              <Route path="watchlist" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaWatchlist /></Suspense>} />
              <Route path="analytics/:auctionId" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaAuctionAnalytics /></Suspense>} />
              <Route path="timeline/:auctionId" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaBattleTimeline /></Suspense>} />
              <Route path="timeline" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaBattleTimeline /></Suspense>} />
              <Route path="auction/:auctionId" element={<RedirectToAuction />} />
              <Route path="auction/:auctionId/analytics" element={<RedirectToAuction />} />
              <Route path="profile/:username" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaProfile /></Suspense>} />
              <Route path="arena-profile/:id" element={<RedirectToArenaProfile />} />
              <Route path="my-profile" element={<Navigate to="/negotiations/profile" replace />} />
              <Route path="checkout/:orderId" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><BattleBidsCheckout /></Suspense>} />
              <Route path="admin/moderation" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaModeration /></Suspense>} />
              {/* Backwards compatibility redirects */}
              <Route path="negotiations" element={<Navigate to="/negotiations" replace />} />
              <Route path="negotiation/:negId" element={<RedirectToNegotiation />} />
            </Route>
            <Route path="orders/:orderId" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><BattleBidsCheckout /></Suspense>} />
            <Route path="negotiations" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaNegotiations /></Suspense>} />
            <Route path="negotiations/create" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaCreateAuction forceNegotiation={true} /></Suspense>} />
            <Route path="negotiations/explore" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaExplore /></Suspense>} />
            <Route path="negotiations/profile" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaMyProfile /></Suspense>} />
            <Route path="negotiations/timeline/:negId" element={<Suspense fallback={<div className="min-h-screen bg-stone-955" />}><ArenaNegotiationView /></Suspense>} />
            <Route path="negotiation/:negId" element={<RedirectToNegotiation />} />
            <Route path="messages" element={<Messages />} />
            <Route path="sellr-dashboard" element={<SellerDashboard />} />
            <Route path="dashboard" element={<RedirectToSellrDashboard />} />
            <Route path="seller-dashboard" element={<RedirectToSellrDashboard />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="kyc" element={<KYCVerification />} />
            <Route path="user/:id" element={<PublicProfile />} />
            <Route path="@:username" element={<PublicProfile />} />
            <Route path="verified" element={<VerifiedProfiles />} />
            <Route path="verified/search" element={<PremiumSellerSearch />} />
            <Route path="premium-sellers" element={<Navigate to="/verified/search" replace />} />
            <Route path="my-listings" element={<RedirectToSellrDashboard />} />
            <Route path="completed" element={<CompletedOrders />} />
            <Route path="disclaimer" element={<Disclaimer />} />
            <Route path="contact" element={<Contact />} />
            <Route path="support" element={<Support />} />
            <Route path="premium" element={<PremiumPage />} />
            <Route path="featured" element={<FeaturedPage />} />
            <Route path="boosts" element={<BoostsPage />} />
            <Route path="boost" element={<Navigate to="/boosts" replace />} />
            <Route path="credits" element={<CreditsPage />} />
            <Route path="why-us" element={<WhyUs />} />
            <Route path="about" element={<WhyUs />} />
            <Route path="faqs" element={<FAQs />} />
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/promotions" element={<AdminPromotions />} />
            <Route path="admin/verifications" element={<AdminVerifications />} />
            {/* Redirect aliases for posting an ad */}
            <Route path="post" element={<Navigate to="/submit" replace />} />
            <Route path="post-ad" element={<Navigate to="/submit" replace />} />
            <Route path="post-your-ads" element={<Navigate to="/submit" replace />} />
            <Route path="post-your-ad" element={<Navigate to="/submit" replace />} />
            <Route path="sell" element={<Navigate to="/submit" replace />} />
            <Route path="sell-your-item" element={<Navigate to="/submit" replace />} />
            <Route path="seller-your-items" element={<Navigate to="/submit" replace />} />
            <Route path="place-your-order" element={<Navigate to="/submit" replace />} />
            <Route path="place-order" element={<Navigate to="/submit" replace />} />
            <Route path="post-order" element={<Navigate to="/submit" replace />} />
            <Route path="post-now" element={<Navigate to="/submit" replace />} />
            <Route path="get-started-for-free" element={<Navigate to="/submit" replace />} />
            <Route path="get-started-free" element={<Navigate to="/submit" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </CreditsProvider>
      </NegotiationProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}
