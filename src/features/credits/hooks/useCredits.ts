import { useCreditsContext } from '../context/CreditsContext';

/**
 * Custom hook to access Credits system state and actions.
 */
export const useCredits = () => {
  return useCreditsContext();
};
