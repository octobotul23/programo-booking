import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Toast } from '../components/ui.jsx';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const timer = useRef(0);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2400);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Toast message={msg} />
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
