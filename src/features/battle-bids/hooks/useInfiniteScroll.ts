import { useState, useEffect, useCallback, useRef } from 'react';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

interface InfiniteScrollOptions<T> {
  fetchData: (pageSize: number, lastDoc?: QueryDocumentSnapshot<DocumentData>) => Promise<{ items: T[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }>;
  pageSize?: number;
}

export function useInfiniteScroll<T>({ fetchData, pageSize = 12 }: InfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async (isInitial = false) => {
    if (loading || (!hasMore && !isInitial)) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchData(pageSize, isInitial ? undefined : (lastDoc || undefined));
      
      if (isInitial) {
        setItems(result.items);
      } else {
        setItems(prev => [...prev, ...result.items]);
      }

      setLastDoc(result.lastDoc);
      setHasMore(result.items.length === pageSize);
    } catch (err: any) {
      setError(err.message || 'Strategic intelligence retrieval failed.');
      console.error('Infinite Scroll Error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchData, hasMore, lastDoc, loading, pageSize]);

  useEffect(() => {
    loadMore(true);
  }, []); // Initial load

  return {
    items,
    loading,
    hasMore,
    error,
    loadMore: () => loadMore(false),
    refresh: () => loadMore(true)
  };
}
