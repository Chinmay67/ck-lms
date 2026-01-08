import { FaFilter, FaTimes, FaChevronDown, FaBars } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import { CourseAPI } from '../../services/api';
import type { Course } from '../../types/course';

interface FilterPanelProps {
  selectedCourse: string;
  onCourseChange: (course: string) => void;
  selectedStatus: 'all' | 'active' | 'inactive';
  onStatusChange: (status: 'all' | 'active' | 'inactive') => void;
  onClearFilters: () => void;
}

const FilterPanel = ({ 
  selectedCourse, 
  onCourseChange, 
  selectedStatus, 
  onStatusChange,
  onClearFilters 
}: FilterPanelProps) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Fetch courses on component mount
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await CourseAPI.getCourses(true); // Get active courses only
        if (response.success && response.data) {
          setCourses(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch courses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  // Get selected course display name
  const getSelectedCourseName = () => {
    if (selectedCourse === 'all') return 'All Courses';
    const course = courses.find(c => c.courseName === selectedCourse);
    return course ? course.displayName : 'All Courses';
  };

  // Handle status toggle click
  const handleStatusToggle = () => {
    if (selectedStatus === 'all') {
      onStatusChange('active');
    } else if (selectedStatus === 'active') {
      onStatusChange('inactive');
    } else {
      onStatusChange('all');
    }
  };

  // Get status label
  const getStatusLabel = () => {
    switch (selectedStatus) {
      case 'all':
        return 'All Status';
      case 'active':
        return 'Active Only';
      case 'inactive':
        return 'Inactive Only';
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (selectedStatus) {
      case 'all':
        return 'bg-gray-500';
      case 'active':
        return 'bg-green-500';
      case 'inactive':
        return 'bg-red-500';
    }
  };

  const hasActiveFilters = selectedCourse !== 'all' || selectedStatus !== 'all';

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden md:flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-text-primary">
          <FaFilter className="text-primary-400" />
          <span className="font-semibold text-sm">Filters:</span>
        </div>

        {/* Course Filter Dropdown */}
        <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`
            px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 btn-hover
            flex items-center gap-2 min-w-[180px] justify-between
            ${selectedCourse !== 'all'
              ? 'bg-gradient-primary text-white shadow-glow'
              : 'bg-surface-alt text-text-secondary hover:bg-primary-50 hover:text-primary-600 border border-primary-100/30'
            }
          `}
        >
          <span>{loading ? 'Loading...' : getSelectedCourseName()}</span>
          <FaChevronDown className={`transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-20 min-w-[200px] overflow-hidden">
              <button
                onClick={() => {
                  onCourseChange('all');
                  setShowDropdown(false);
                }}
                className={`
                  w-full px-4 py-3 text-left text-sm font-semibold transition-colors
                  ${selectedCourse === 'all' 
                    ? 'bg-primary-100 text-primary-700' 
                    : 'text-text-secondary hover:bg-surface-alt'
                  }
                `}
              >
                All Courses
              </button>
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => {
                    onCourseChange(course.courseName);
                    setShowDropdown(false);
                  }}
                  className={`
                    w-full px-4 py-3 text-left text-sm font-semibold transition-colors
                    ${selectedCourse === course.courseName 
                      ? 'bg-primary-100 text-primary-700' 
                      : 'text-text-secondary hover:bg-surface-alt'
                    }
                  `}
                >
                  {course.displayName}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Active/Inactive Toggle */}
      <button
        onClick={handleStatusToggle}
        className={`
          px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 btn-hover
          flex items-center gap-2
          ${selectedStatus !== 'all'
            ? 'bg-gradient-primary text-white shadow-glow'
            : 'bg-surface-alt text-text-secondary hover:bg-primary-50 hover:text-primary-600 border border-primary-100/30'
          }
        `}
      >
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span>{getStatusLabel()}</span>
      </button>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
          >
            <FaTimes />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Mobile Filter Toggle */}
      <div className="md:hidden">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className={`
            w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200
            flex items-center justify-between gap-2
            ${hasActiveFilters
              ? 'bg-gradient-primary text-white shadow-glow'
              : 'bg-surface-alt text-text-secondary border border-primary-100/30'
            }
          `}
        >
          <div className="flex items-center gap-2">
            <FaBars />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                Active
              </span>
            )}
          </div>
          <FaChevronDown className={`transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Mobile Filters Dropdown */}
        {showMobileFilters && (
          <div className="mt-3 space-y-3 p-4 bg-surface rounded-xl border border-primary-100/30 shadow-lg">
            {/* Course Filter */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Course
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`
                    w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200
                    flex items-center gap-2 justify-between
                    ${selectedCourse !== 'all'
                      ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                      : 'bg-surface-alt text-text-secondary border border-primary-100/30'
                    }
                  `}
                >
                  <span>{loading ? 'Loading...' : getSelectedCourseName()}</span>
                  <FaChevronDown className={`transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowDropdown(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-20 w-full overflow-hidden">
                      <button
                        onClick={() => {
                          onCourseChange('all');
                          setShowDropdown(false);
                        }}
                        className={`
                          w-full px-4 py-3 text-left text-sm font-semibold transition-colors
                          ${selectedCourse === 'all' 
                            ? 'bg-primary-100 text-primary-700' 
                            : 'text-text-secondary hover:bg-surface-alt'
                          }
                        `}
                      >
                        All Courses
                      </button>
                      {courses.map((course) => (
                        <button
                          key={course.id}
                          onClick={() => {
                            onCourseChange(course.courseName);
                            setShowDropdown(false);
                          }}
                          className={`
                            w-full px-4 py-3 text-left text-sm font-semibold transition-colors
                            ${selectedCourse === course.courseName 
                              ? 'bg-primary-100 text-primary-700' 
                              : 'text-text-secondary hover:bg-surface-alt'
                            }
                          `}
                        >
                          {course.displayName}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Status
              </label>
              <button
                onClick={handleStatusToggle}
                className={`
                  w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200
                  flex items-center gap-2 justify-center
                  ${selectedStatus !== 'all'
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                    : 'bg-surface-alt text-text-secondary border border-primary-100/30'
                  }
                `}
              >
                <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
                <span>{getStatusLabel()}</span>
              </button>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  onClearFilters();
                  setShowMobileFilters(false);
                }}
                className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <FaTimes />
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default FilterPanel;
