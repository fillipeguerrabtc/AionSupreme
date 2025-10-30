import { useEffect } from 'react';
import { useLocation } from 'wouter';

export function usePageTitle() {
  const [location] = useLocation();

  useEffect(() => {
    let title = 'AION Chat';
    
    if (location.startsWith('/admin')) {
      title = 'AION Admin - Painel de Controle';
    }

    document.title = title;
  }, [location]);
}
