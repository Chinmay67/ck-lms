import { User, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface NavbarProps {
  pageTitle: string;
}

const Navbar = ({ pageTitle }: NavbarProps) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="h-14 flex items-center justify-between pl-14 pr-4 md:px-5 bg-surface border-b border-border flex-shrink-0 sticky top-0 z-40">
      {/* Page title */}
      <div className="min-w-0">
        <div className="text-[11px] text-text-tertiary uppercase tracking-wide">Admin</div>
        <h1 className="text-sm font-semibold text-text-primary tracking-tight truncate">{pageTitle}</h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* User pill */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-alt border border-border">
          <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
            <User className="w-3 h-3 text-white" strokeWidth={2} />
          </div>
          <span className="text-xs font-medium text-text-primary hidden sm:block">{user?.name || 'Admin'}</span>
          <span className="text-xs text-text-tertiary capitalize hidden sm:block">· {user?.role}</span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4" strokeWidth={1.8} />
            : <Moon className="w-4 h-4" strokeWidth={1.8} />}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          title="Logout"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-error-400 hover:bg-error-600/10 transition-colors"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
