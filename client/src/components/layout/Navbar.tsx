import { FaGraduationCap, FaUser, FaSignOutAlt } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  return (
    <nav className="bg-gradient-primary shadow-navy-lg sticky top-0 z-50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo and Brand */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
            <img 
              src="./GyanVibe2.png" 
              alt="GyanVibe Logo" 
              className="w-12 h-12 sm:w-16 sm:h-14 object-contain hover:scale-105 transition-transform duration-300 cursor-pointer drop-shadow-lg flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">
                GyanVibe
              </h1>
              <p className="text-[10px] sm:text-xs text-primary-100 font-medium hidden xs:block truncate">Learning Management System</p>
            </div>
          </div>

          {/* Right Side Icons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* User Profile */}
            <div className="flex items-center gap-2 sm:gap-3 bg-white/10 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-primary-400/20 hover:bg-white/15 transition-all duration-200">
              <div className="w-7 h-7 sm:w-9 sm:h-9 bg-gradient-secondary rounded-full flex items-center justify-center shadow-gold flex-shrink-0">
                <FaUser className="text-white text-xs sm:text-sm" />
              </div>
              <div className="hidden sm:flex flex-col min-w-0">
                <span className="text-white font-semibold text-sm truncate max-w-[120px]">{user?.name || 'Admin'}</span>
                <span className="text-primary-200 text-xs capitalize font-medium">{user?.role || 'user'}</span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 sm:gap-2 bg-red-500/20 hover:bg-red-500/30 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl transition-all duration-200 text-white border border-red-400/20 hover:border-red-400/40 group"
              title="Logout"
            >
              <FaSignOutAlt className="text-base sm:text-lg group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline font-semibold text-sm">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
