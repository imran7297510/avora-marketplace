import { Bid } from '../types';

export const AnalyticsUtils = {
  /**
   * Calculates the average bid amount.
   */
  calculateAverageBid(bids: Bid[]): number {
    if (bids.length === 0) return 0;
    const sum = bids.reduce((acc, bid) => acc + bid.amount, 0);
    return sum / bids.length;
  },

  /**
   * Calculates price growth from starting price to current price.
   */
  calculatePriceGrowth(startingPrice: number, currentPrice: number): number {
    return currentPrice - startingPrice;
  },

  /**
   * Calculates percentage increase from starting price.
   */
  calculatePercentageIncrease(startingPrice: number, currentPrice: number): number {
    if (startingPrice === 0) return 0;
    return ((currentPrice - startingPrice) / startingPrice) * 100;
  },

  /**
   * Calculates bid velocity (bids per hour) over the duration of the auction.
   */
  calculateBidVelocity(bids: Bid[], startTime: Date | null, endTime: Date | null): number {
    if (bids.length === 0 || !startTime || !endTime) return 0;
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return 0;
    
    const now = new Date();
    const effectiveEnd = now < endTime ? now : endTime;
    const durationHours = (effectiveEnd.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    
    if (durationHours <= 0) return bids.length;
    return bids.length / durationHours;
  },

  /**
   * Calculates momentum by comparing recent bid frequency to overall frequency.
   * > 1 means accelerating, < 1 means decelerating.
   */
  calculateMomentum(bids: Bid[]): number {
    if (bids.length < 5) return 1;
    
    // Filter out bids with invalid timestamps before sorting
    const validBids = bids.filter(b => b.timestamp && !isNaN(b.timestamp.getTime()));
    if (validBids.length < 5) return 1;

    const sortedBids = [...validBids].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const recentBids = sortedBids.slice(0, 5);
    const overallBids = sortedBids;

    const recentDuration = (recentBids[0].timestamp.getTime() - recentBids[recentBids.length - 1].timestamp.getTime()) / (1000 * 60);
    const overallDuration = (overallBids[0].timestamp.getTime() - overallBids[overallBids.length - 1].timestamp.getTime()) / (1000 * 60);

    if (recentDuration === 0 || overallDuration === 0) return 1;

    const recentRate = 5 / recentDuration;
    const overallRate = overallBids.length / overallDuration;

    return recentRate / overallRate;
  }
};
