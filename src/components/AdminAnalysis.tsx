import { useState, useEffect } from 'react';
import { collection, query, where, getCountFromServer, getDocs, sum } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2 } from 'lucide-react';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { UserProfile } from '../types';

interface Stats {
  users: { total: number, active: number, blocked: number };
  listings: { total: number, soldOut: number, live: number, removed: number };
  premium: { total: number, active: number, revenue: number };
  promotedAds: { total: number, active: number, revenue: number };
  reports: { total: number, actionsTaken: number, pending: number };
  support: { total: number, solved: number, pending: number };
}

export function AdminAnalysis() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // Users
      const usersSnap = await getCountFromServer(collection(db, 'users'));
      const activeUsersSnap = await getCountFromServer(query(collection(db, 'users'), where('isBlocked', '==', false)));
      const [blockedUsersSnap, bannedUsersSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'users'), where('isBlocked', '==', true))).catch(() => ({ data: () => ({ count: 0 }) })),
        getCountFromServer(query(collection(db, 'users'), where('isBanned', '==', true))).catch(() => ({ data: () => ({ count: 0 }) })),
      ]);
      const totalBlockedOrBanned = Math.max(blockedUsersSnap.data().count, blockedUsersSnap.data().count + bannedUsersSnap.data().count);

      // Listings
      const listingsSnap = await getCountFromServer(collection(db, 'listings'));
      const soldSnap = await getCountFromServer(query(collection(db, 'listings'), where('status', '==', 'SOLD')));
      const liveSnap = await getCountFromServer(query(collection(db, 'listings'), where('status', '==', 'LIVE')));
      const removedSnap = await getCountFromServer(query(collection(db, 'listings'), where('status', '==', 'SUSPENDED')));

      // Authoritative Premium Seller validation (strictly requires Approved KYC + Active Premium subscription)
      const kycApprovedSnap = await getDocs(query(collection(db, 'users'), where('kycStatus', '==', 'APPROVED')));
      const kycApprovedUsers = kycApprovedSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile));

      const activePremiumUsers = kycApprovedUsers.filter(user => 
        resolveAuthoritativeVerification(user).isPremiumCurrentlyActive
      );
      const registeredPremiumUsers = kycApprovedUsers.filter(user => 
        user.isPremiumVerified === true || 
        user.isPremiumSeller === true || 
        user.premiumBadgeActive === true || 
        user.verifiedBadgeType === 'GOLDEN' || 
        user.verifiedBadgeType === 'PREMIUM' ||
        user.verifiedBadgeRequestStatus === 'APPROVED' ||
        user.verifiedBadgeRequestStatus === 'EXPIRED' ||
        user.verifiedBadgeRequestStatus === 'REVOKED'
      );
      const totalRegisteredPremium = Math.max(registeredPremiumUsers.length, activePremiumUsers.length);
      
      // Promotion Requests (narrowed to APPROVED promotions only to prevent full-collection scans of pending/rejected requests)
      const promoSnap = await getDocs(query(collection(db, 'promotionRequests'), where('status', '==', 'APPROVED')));
      const approvedPromo = promoSnap.docs.map(d => ({...d.data(), id: d.id} as any));
      
      const premiumRevenue = approvedPromo.filter(p => p.type === 'VERIFIED').reduce((acc, p) => acc + (p.amount || 0), 0);
      const featuredBoosted = approvedPromo.filter(p => p.type === 'FEATURED' || p.type === 'BOOST');
      const featuredBoostedRevenue = featuredBoosted.reduce((acc, p) => acc + (p.amount || 0), 0);
      
      // Reports
      const reportsSnap = await getCountFromServer(collection(db, 'reports'));
      const resolvedReportsSnap = await getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'RESOLVED')));
      const pendingReportsSnap = await getCountFromServer(query(collection(db, 'reports'), where('status', '!=', 'RESOLVED')));

      // Support
      const ticketsSnap = await getCountFromServer(collection(db, 'supportTickets'));
      const solvedTicketsSnap = await getCountFromServer(query(collection(db, 'supportTickets'), where('status', '==', 'SOLVED')));
      const pendingTicketsSnap = await getCountFromServer(query(collection(db, 'supportTickets'), where('status', '!=', 'SOLVED')));

      setStats({
        users: { total: usersSnap.data().count, active: activeUsersSnap.data().count, blocked: totalBlockedOrBanned },
        listings: { total: listingsSnap.data().count, soldOut: soldSnap.data().count, live: liveSnap.data().count, removed: removedSnap.data().count },
        premium: { total: totalRegisteredPremium, active: activePremiumUsers.length, revenue: premiumRevenue },
        promotedAds: { total: featuredBoosted.length, active: featuredBoosted.length, revenue: featuredBoostedRevenue },
        reports: { total: reportsSnap.data().count, actionsTaken: resolvedReportsSnap.data().count, pending: pendingReportsSnap.data().count },
        support: { total: ticketsSnap.data().count, solved: solvedTicketsSnap.data().count, pending: pendingTicketsSnap.data().count }
      });
    } catch (e: any) {
      if (e?.code === 'resource-exhausted') {
        console.warn('AdminAnalysis: Quota exceeded while fetching stats');
      } else {
        console.error("Error fetching stats", e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  if (!stats) return <div className="p-6 text-stone-400">Failed to load statistics.</div>;

  const StatCard = ({ title, value, label }: { title: string, value: string | number, label?: string }) => (
    <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
      <h3 className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-2xl font-black text-stone-900">{value}</p>
      {label && <p className="text-stone-400 text-xs mt-1">{label}</p>}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-stone-900">Analysis</h2>
        <button 
          onClick={fetchData}
          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-colors"
        >
          Refresh Data
        </button>
      </div>
      
      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">User Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Registered Users" value={stats.users.total} />
          <StatCard title="Total Live Accounts" value={stats.users.active} />
          <StatCard title="Total Blocked/ Banned Accounts" value={stats.users.blocked} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">Listings Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total Listings" value={stats.listings.total} />
          <StatCard title="Sold Out" value={stats.listings.soldOut} />
          <StatCard title="Live/Available" value={stats.listings.live} />
          <StatCard title="Removed by Admin" value={stats.listings.removed} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">Premium Sellers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Registered" value={stats.premium.total} />
          <StatCard title="Active Sellers" value={stats.premium.active} />
          <StatCard title="Revenue (PKR)" value={`Rs. ${stats.premium.revenue}`} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">Reported Listings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Reported" value={stats.reports.total} />
          <StatCard title="Actions Taken" value={stats.reports.actionsTaken} />
          <StatCard title="Pending Reports" value={stats.reports.pending} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">Promoted Ads</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Upgraded" value={stats.promotedAds.total} />
          <StatCard title="Active Promoted" value={stats.promotedAds.active} />
          <StatCard title="Revenue (PKR)" value={`Rs. ${stats.promotedAds.revenue}`} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-stone-800 mb-2">Support Tickets</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Tickets" value={stats.support.total} />
          <StatCard title="Solved/Closed" value={stats.support.solved} />
          <StatCard title="Pending" value={stats.support.pending} />
        </div>
      </section>
    </div>
  );
}
