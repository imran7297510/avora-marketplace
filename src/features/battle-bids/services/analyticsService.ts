import { 
  collection, 
  query, 
  orderBy, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { AuctionItem, Bid, AuctionAnalytics } from '../types';
import { AnalyticsUtils } from '../utils/analyticsUtils';
import { parseSafeDate } from '../utils/arena';

export const AnalyticsService = {
  /**
   * Generates comprehensive analytics for a specific auction.
   */
  async getAuctionAnalytics(auction: AuctionItem): Promise<AuctionAnalytics> {
    const bidsQuery = query(
      collection(db, 'arena_auctions', auction.id, 'bids'),
      orderBy('timestamp', 'asc')
    );
    
    const bidsSnapshot = await getDocs(bidsQuery);
    const bids = bidsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: parseSafeDate(doc.data().timestamp)
    } as Bid));

    const uniqueBidders = new Set(bids.map(b => b.userId)).size;
    const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : auction.startingPrice;
    const lowestBid = bids.length > 0 ? Math.min(...bids.map(b => b.amount)) : auction.startingPrice;

    // Build price trend data
    const priceTrends = [
      { timestamp: auction.startTime, price: auction.startingPrice },
      ...bids.map(b => ({ timestamp: b.timestamp, price: b.amount }))
    ];

    return {
      id: auction.id,
      bidHistory: bids.map(b => ({
        amount: b.amount,
        timestamp: b.timestamp,
        userName: b.userName
      })),
      statistics: {
        averageBid: AnalyticsUtils.calculateAverageBid(bids),
        highestBid,
        lowestBid,
        totalBids: bids.length,
        uniqueBidders,
        priceGrowth: AnalyticsUtils.calculatePriceGrowth(auction.startingPrice, auction.currentBid),
        percentageIncrease: AnalyticsUtils.calculatePercentageIncrease(auction.startingPrice, auction.currentBid),
        bidVelocity: AnalyticsUtils.calculateBidVelocity(bids, auction.startTime, auction.endTime),
        momentum: AnalyticsUtils.calculateMomentum(bids)
      },
      priceTrends
    };
  }
};
