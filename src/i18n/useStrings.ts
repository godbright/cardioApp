import { useApp } from '../context/AppContext';
import { getStrings, UIStrings } from './strings';

export function useStrings(): UIStrings {
  const { state } = useApp();
  return getStrings(state.lang);
}
