import React, { createContext, useContext, useState } from 'react';

type LoadingState = {
  isLoading: boolean;
  message: string;
};

interface LoadingContextProps {
  loadingState: LoadingState;
  showLoading: (message: string) => void;
  hideLoading: () => void;
  withLoading: <T>(message: string, promise: Promise<T> | (() => Promise<T>)) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextProps | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loadingState, setLoadingState] = useState<LoadingState>({ isLoading: false, message: '' });

  const showLoading = (message: string) => setLoadingState({ isLoading: true, message });
  const hideLoading = () => setLoadingState({ isLoading: false, message: '' });

  const withLoading = async <T,>(message: string, promiseOrFn: Promise<T> | (() => Promise<T>)): Promise<T> => {
    showLoading(message);
    try {
      const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
      return await promise;
    } finally {
      hideLoading();
    }
  };

  return (
    <LoadingContext.Provider value={{ loadingState, showLoading, hideLoading, withLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
