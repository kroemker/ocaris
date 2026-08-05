import { ThemeContext } from './ThemeContext'
import { useThemeState } from './useTheme'

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ThemeContext.Provider value={useThemeState()}>{children}</ThemeContext.Provider>
}
