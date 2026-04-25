"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      const ssrTheme = document.documentElement.getAttribute("data-theme");
      if (ssrTheme === "dark" || ssrTheme === "light") {
        return ssrTheme;
      }
    }
    return "light";
  });

  useEffect(() => {
    // Keep client state aligned with the pre-hydration theme from layout script
    const savedTheme = localStorage.getItem("stellar-market-theme") as Theme | null;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    const initialTheme = savedTheme || systemTheme;
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
    // Remove the default 'dark' class if present to favor data-theme
    document.documentElement.classList.remove("dark");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("stellar-market-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
