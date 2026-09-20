import React, { createContext, useContext, useState } from 'react';

/**
 * ============================================================================
 * DATA SOURCE ABSTRACTION & SECURITY CONTRACT
 * ============================================================================
 * 
 * In AquaSentinel, data source state is strictly isolated:
 * 
 * 1. Default State: Always "live". Every page, route, and session begins in
 *    "live" mode, fetching from real backend pipeline endpoints.
 * 
 * 2. No Silent Mock Fallback: When a live query returns empty or fails, the UI
 *    MUST render an explicit empty, loading, or error state. It must NEVER
 *    silently substitute fixture or mock data.
 * 
 * 3. Dedicated Testing Isolation: "test" mode is ONLY allowed within the
 *    dedicated Testing Page component (/testing). Navigating away from
 *    the Testing Page immediately resets dataSource back to "live".
 * 
 * 4. Runtime Guardrail: Main operational dashboard pages assert that
 *    dataSource === "live" and fail loudly if test data is ever supplied.
 * ============================================================================
 */

export type DataSource = 'live' | 'test';

interface DataSourceContextValue {
  dataSource: DataSource;
  setDataSource: (source: DataSource) => void;
}

const DataSourceContext = createContext<DataSourceContextValue>({
  dataSource: 'live',
  setDataSource: () => {
    // Default no-op
  },
});

export const DataSourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dataSource, setDataSource] = useState<DataSource>('live');

  return (
    <DataSourceContext.Provider value={{ dataSource, setDataSource }}>
      {children}
    </DataSourceContext.Provider>
  );
};

export const useDataSource = (): DataSourceContextValue => {
  const ctx = useContext(DataSourceContext);
  return ctx;
};

/**
 * Runtime Guardrail Assertion
 * Call this inside main operational views to ensure test data never leaks into live production views.
 */
export function assertLiveDataSource(source: DataSource, componentName: string): void {
  if (source !== 'live') {
    const errorMsg = `[SECURITY VIOLATION] Component "${componentName}" was loaded with dataSource="${source}". Main operational dashboard views must only render live data.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}
