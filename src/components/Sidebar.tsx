import React, { memo } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Search, 
  Bell, 
  Shield, 
  Brain, 
  Moon, 
  Sun 
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { cn } from '../utils/cn';

interface SidebarProps {
  className?: string;
}

const Sidebar = memo(({ className }: SidebarProps) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className={cn(
      "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0",
      className
    )}>
      <div className="h-full px-3 py-4 flex flex-col">
        <div className="mb-8 px-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">CryptoAI</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Smart Analytics Platform</p>
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavLink 
            to="/" 
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "bg-gray-100 dark:bg-gray-700"
              )
            }
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Dashboard
          </NavLink>

          <NavLink 
            to="/token-search" 
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "bg-gray-100 dark:bg-gray-700"
              )
            }
          >
            <Search className="w-5 h-5 mr-3" />
            Token Search
          </NavLink>

          <NavLink 
            to="/alerts" 
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "bg-gray-100 dark:bg-gray-700"
              )
            }
          >
            <Bell className="w-5 h-5 mr-3" />
            Smart Alerts
          </NavLink>

          <NavLink 
            to="/scam-detector" 
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "bg-gray-100 dark:bg-gray-700"
              )
            }
          >
            <Shield className="w-5 h-5 mr-3" />
            Scam Detector
          </NavLink>

          <NavLink 
            to="/ai-analysis" 
            className={({ isActive }) =>
              cn(
                "flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "bg-gray-100 dark:bg-gray-700"
              )
            }
          >
            <Brain className="w-5 h-5 mr-3" />
            AI Analysis
          </NavLink>
        </nav>

        <button
          onClick={toggleTheme}
          className="mt-auto flex items-center px-4 py-2 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 mr-3" />
          ) : (
            <Moon className="w-5 h-5 mr-3" />
          )}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;