import { useState, useEffect } from 'react';
import type { Course, CourseFormData, LevelFormData } from '../../types/course';
import { CourseAPI } from '../../services/api';
import toast from 'react-hot-toast';

const CourseConfigurationPanel = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState<{ course: Course; levelNumber: number } | null>(null);
  const [showLevelForm, setShowLevelForm] = useState(false);

  const [courseForm, setCourseForm] = useState<CourseFormData>({
    courseName: '',
    displayName: '',
    description: '',
    isActive: true,
    displayOrder: 0,
  });

  const [levelForm, setLevelForm] = useState<LevelFormData>({
    levelNumber: 1,
    feeAmount: 0,
    durationMonths: 1,
    approximateHours: 0,
    description: '',
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await CourseAPI.getCourses();
      if (response.success && response.data) {
        setCourses(response.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch courses:', error);
      toast.error(error.message || 'Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setCourseForm({
      courseName: '',
      displayName: '',
      description: '',
      isActive: true,
      displayOrder: courses.length,
    });
    setShowCourseForm(true);
  };

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setCourseForm({
      courseName: course.courseName,
      displayName: course.displayName,
      description: course.description || '',
      isActive: course.isActive,
      displayOrder: course.displayOrder,
    });
    setShowCourseForm(true);
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCourse) {
        const response = await CourseAPI.updateCourse(editingCourse.id || editingCourse._id!, courseForm);
        if (response.success) {
          toast.success('Course updated successfully');
          fetchCourses();
          setShowCourseForm(false);
        }
      } else {
        const response = await CourseAPI.createCourse(courseForm);
        if (response.success) {
          toast.success('Course created successfully');
          fetchCourses();
          setShowCourseForm(false);
        }
      }
    } catch (error: any) {
      console.error('Failed to save course:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save course');
    }
  };

  const handleDeleteCourse = async (course: Course) => {
    if (!window.confirm(`Are you sure you want to delete "${course.displayName}"?`)) {
      return;
    }
    try {
      const response = await CourseAPI.deleteCourse(course.id || course._id!);
      if (response.success) {
        toast.success('Course deleted successfully');
        fetchCourses();
      }
    } catch (error: any) {
      console.error('Failed to delete course:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to delete course');
    }
  };

  const handleAddLevel = (course: Course) => {
    const nextLevelNumber = course.levels.length + 1;
    if (nextLevelNumber > 5) {
      toast.error('Maximum 5 levels allowed per course');
      return;
    }
    setEditingLevel({ course, levelNumber: nextLevelNumber });
    setLevelForm({
      levelNumber: nextLevelNumber,
      feeAmount: 0,
      durationMonths: 1,
      approximateHours: 0,
      description: '',
    });
    setShowLevelForm(true);
  };

  const handleEditLevel = (course: Course, level: any) => {
    setEditingLevel({ course, levelNumber: level.levelNumber });
    setLevelForm({
      levelNumber: level.levelNumber,
      feeAmount: level.feeAmount,
      durationMonths: level.durationMonths,
      approximateHours: level.approximateHours,
      description: level.description || '',
    });
    setShowLevelForm(true);
  };

  const handleLevelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;

    try {
      const courseId = editingLevel.course.id || editingLevel.course._id!;
      
      if (editingLevel.levelNumber <= editingLevel.course.levels.length) {
        // Update existing level
        const response = await CourseAPI.updateLevel(courseId, editingLevel.levelNumber, levelForm);
        if (response.success) {
          toast.success('Level updated successfully');
          fetchCourses();
          setShowLevelForm(false);
        }
      } else {
        // Add new level
        const response = await CourseAPI.addLevel(courseId, levelForm);
        if (response.success) {
          toast.success('Level added successfully');
          fetchCourses();
          setShowLevelForm(false);
        }
      }
    } catch (error: any) {
      console.error('Failed to save level:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to save level');
    }
  };

  const handleDeleteLevel = async (course: Course, levelNumber: number) => {
    if (!window.confirm(`Are you sure you want to remove Level ${levelNumber} from "${course.displayName}"?`)) {
      return;
    }
    try {
      const courseId = course.id || course._id!;
      const response = await CourseAPI.removeLevel(courseId, levelNumber);
      if (response.success) {
        toast.success('Level removed successfully');
        fetchCourses();
      }
    } catch (error: any) {
      console.error('Failed to remove level:', error);
      toast.error(error.response?.data?.error || error.message || 'Failed to remove level');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-text-primary">Course Configuration</h2>
        <button
          onClick={handleAddCourse}
          className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          Add Course
        </button>
      </div>

      {/* Course Form Modal */}
      {showCourseForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-surface rounded-xl shadow-2xl p-4 md:p-6 max-w-lg w-full my-8">
            <h3 className="text-base md:text-lg font-semibold text-text-primary mb-4">
              {editingCourse ? 'Edit Course' : 'Add New Course'}
            </h3>
            <form onSubmit={handleCourseSubmit} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Course Name *
                </label>
                <input
                  type="text"
                  value={courseForm.courseName}
                  onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value.toLowerCase() })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  placeholder="e.g., beginner"
                  disabled={!!editingCourse}
                  required
                />
                <p className="text-xs text-text-tertiary mt-1">Lowercase, unique identifier (e.g., beginner, intermediate)</p>
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={courseForm.displayName}
                  onChange={(e) => setCourseForm({ ...courseForm, displayName: e.target.value })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  placeholder="e.g., Beginner Chess Training"
                  required
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  rows={3}
                  placeholder="Course description..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={courseForm.displayOrder}
                    onChange={(e) => setCourseForm({ ...courseForm, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                    min="0"
                  />
                </div>

                <div className="flex items-center sm:pt-6">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={courseForm.isActive}
                      onChange={(e) => setCourseForm({ ...courseForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-primary-600 border-border rounded focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-text-primary font-medium">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-primary-100">
                <button
                  type="button"
                  onClick={() => setShowCourseForm(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  {editingCourse ? 'Update Course' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Level Form Modal */}
      {showLevelForm && editingLevel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-surface rounded-xl shadow-2xl p-4 md:p-6 max-w-lg w-full my-8">
            <h3 className="text-base md:text-lg font-semibold text-text-primary mb-4">
              {editingLevel.levelNumber <= editingLevel.course.levels.length ? 'Edit Level' : 'Add Level'}
            </h3>
            <form onSubmit={handleLevelSubmit} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Level Number *
                </label>
                <input
                  type="number"
                  value={levelForm.levelNumber}
                  onChange={(e) => setLevelForm({ ...levelForm, levelNumber: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  min="1"
                  max="5"
                  disabled={editingLevel.levelNumber <= editingLevel.course.levels.length}
                  required
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Monthly Fee (₹) *
                </label>
                <input
                  type="number"
                  value={levelForm.feeAmount}
                  onChange={(e) => setLevelForm({ ...levelForm, feeAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  min="0"
                  step="0.01"
                  required
                />
                <p className="text-xs text-text-tertiary mt-1">Fee charged per month for this level</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                    Duration (Months) *
                  </label>
                  <input
                    type="number"
                    value={levelForm.durationMonths}
                    onChange={(e) => setLevelForm({ ...levelForm, durationMonths: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                    min="1"
                    required
                  />
                  <p className="text-xs text-text-tertiary mt-1">Viewing only</p>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                    Approx. Hours
                  </label>
                  <input
                    type="number"
                    value={levelForm.approximateHours}
                    onChange={(e) => setLevelForm({ ...levelForm, approximateHours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                    min="0"
                  />
                  <p className="text-xs text-text-tertiary mt-1">Viewing only</p>
                </div>
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-text-secondary mb-1">
                  Level Description
                </label>
                <textarea
                  value={levelForm.description}
                  onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })}
                  className="w-full px-3 md:px-4 py-2 text-sm md:text-base border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface"
                  rows={3}
                  placeholder="What students learn at this level..."
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 pt-4 border-t border-primary-100">
                <button
                  type="button"
                  onClick={() => setShowLevelForm(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  {editingLevel.levelNumber <= editingLevel.course.levels.length ? 'Update Level' : 'Add Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Courses List */}
      <div className="space-y-4 md:space-y-6">
        {courses.map((course) => (
          <div
            key={course.id || course._id}
            className="bg-surface rounded-xl shadow-md p-4 md:p-6 border-l-4 border-primary-600"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg md:text-xl font-bold text-text-primary break-words">{course.displayName}</h3>
                <p className="text-xs md:text-sm text-text-tertiary mt-1">Code: {course.courseName}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  course.isActive ? 'bg-success-100 text-success-800' : 'bg-surface text-text-secondary border border-border'
                }`}>
                  {course.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => handleEditCourse(course)}
                  className="p-1.5 md:p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title="Edit Course"
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteCourse(course)}
                  className="p-1.5 md:p-2 text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                  title="Delete Course"
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {course.description && (
              <p className="text-sm md:text-base text-text-secondary mb-4">{course.description}</p>
            )}

            <div className="border-t border-primary-100 pt-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <h4 className="text-sm md:text-base font-semibold text-text-primary">
                  Levels ({course.levels.length}/5)
                </h4>
                {course.levels.length < 5 && (
                  <button
                    onClick={() => handleAddLevel(course)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    + Add Level
                  </button>
                )}
              </div>

              {course.levels.length === 0 ? (
                <p className="text-xs md:text-sm text-text-tertiary italic">No levels configured yet</p>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {course.levels.map((level) => (
                    <div
                      key={level.levelNumber}
                      className="bg-surface-hover rounded-xl p-3 md:p-4 border border-border"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-sm md:text-base font-semibold text-text-primary">Level {level.levelNumber}</span>
                            <span className="text-text-tertiary hidden sm:inline">•</span>
                            <span className="text-xs md:text-sm font-medium text-primary-600">₹{level.feeAmount.toLocaleString()}/month</span>
                          </div>
                          <div className="text-xs md:text-sm text-text-secondary space-y-1">
                            <div>Duration: {level.durationMonths} month{level.durationMonths > 1 ? 's' : ''}</div>
                            {level.approximateHours > 0 && (
                              <div>Approx. Hours: {level.approximateHours}</div>
                            )}
                            {level.description && (
                              <div className="text-text-tertiary italic mt-1">{level.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleEditLevel(course, level)}
                            className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors"
                            title="Edit Level"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteLevel(course, level.levelNumber)}
                            className="p-1.5 text-error-600 hover:bg-error-100 rounded-lg transition-colors"
                            title="Remove Level"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div className="text-center py-12 bg-surface rounded-xl shadow-md border border-border">
          <p className="text-sm md:text-base text-text-tertiary">No courses found. Click "Add Course" to create one.</p>
        </div>
      )}
    </div>
  );
};

export default CourseConfigurationPanel;
