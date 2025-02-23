import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from "./components/ThemeProvider";

const App: React.FC = () => {
  // إدارة الحالة لتحسين تجربة المستخدم
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("theme") === "dark";
  });

  // تبديل وضع الثيم وحفظه في التخزين المحلي
  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = !prev;
      localStorage.setItem("theme", newTheme ? "dark" : "light");
      return newTheme;
    });
  }, []);

  // تحديث الثيم عند تحميل الصفحة
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  return (
    <ThemeProvider>
      <Router>
        <div className={`min-h-screen ${isDarkMode ? "dark" : "light"}`}>
          <Navbar toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
          <main className="container mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
          <Toaster position="top-right" />
        </div>
      </Router>
    </ThemeProvider>
  );
};

export default React.memo(App);
