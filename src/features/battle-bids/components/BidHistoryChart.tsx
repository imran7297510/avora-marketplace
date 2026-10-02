import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import { formatPrice, getCurrencyByCode } from '../../../lib/currencies';

interface BidHistoryChartProps {
  data?: { timestamp: Date; price: number }[];
  bids?: any[];
  startingPrice?: number;
  reservePrice?: number;
  currencySymbol?: string;
  currency?: string;
  height?: number;
}

export const BidHistoryChart: React.FC<BidHistoryChartProps> = ({ 
  data, 
  bids,
  startingPrice,
  reservePrice,
  currencySymbol,
  currency,
  height = 300 
}) => {
  const effectiveCurrency = currencySymbol || currency;
  const symbol = getCurrencyByCode(effectiveCurrency).symbol;

  let rawPoints = data || [];
  if ((!rawPoints || rawPoints.length === 0) && bids && bids.length > 0) {
    const points: { timestamp: Date; price: number }[] = [];
    if (startingPrice) {
      points.push({ timestamp: new Date(Date.now() - 3600000), price: startingPrice });
    }
    bids.slice().reverse().forEach((b: any) => {
      const ts = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp ? new Date(b.timestamp) : new Date());
      points.push({ timestamp: ts, price: b.amount || b.price || 0 });
    });
    rawPoints = points;
  } else if ((!rawPoints || rawPoints.length === 0) && startingPrice) {
    rawPoints = [{ timestamp: new Date(), price: startingPrice }];
  }

  const chartData = rawPoints.map(item => ({
    ...item,
    time: item.timestamp && !isNaN(new Date(item.timestamp).getTime()) 
      ? format(new Date(item.timestamp), 'HH:mm') 
      : '--:--',
    formattedPrice: formatPrice(item.price, effectiveCurrency)
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-stone-900 border border-white/10 p-4 rounded-xl shadow-2xl">
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-sm font-black text-amber-500 italic">{formatPrice(payload[0].value, effectiveCurrency)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height, minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#44403c" 
            fontSize={10} 
            fontWeight="bold"
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis 
            stroke="#44403c" 
            fontSize={10} 
            fontWeight="bold"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => {
              if (value >= 1000000) return `${symbol}${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `${symbol}${(value / 1000).toFixed(0)}k`;
              return `${symbol}${value}`;
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {reservePrice && (
            <ReferenceLine 
              y={reservePrice} 
              stroke="#059669" 
              strokeDasharray="3 3" 
              label={{ 
                value: 'RESERVE', 
                position: 'right', 
                fill: '#059669', 
                fontSize: 8, 
                fontWeight: 'black' 
              }} 
            />
          )}
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#f59e0b" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
