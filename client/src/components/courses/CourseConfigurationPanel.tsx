import { useState, useEffect } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { Course } from '../../types/course';
import { AdminCoursesAPI } from '../../services/api';
import toast from 'react-hot-toast';
import FeeDivergencePanel from './FeeDivergencePanel';
import Modal from '../ui/Modal';

interface CourseForm { courseName: string; displayName: string; description: string; isActive: boolean; displayOrder: number; }
interface StageForm { stageName: string; }
interface LevelForm { levelNumber: number; feeAmount: number; durationMonthsMin: number; durationMonthsMax: number; approximateHours: number; description: string; }

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-surface';
const btnPrimary = 'px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors font-medium text-sm disabled:opacity-50';
const btnGhost = 'px-4 py-2 border border-border text-text-secondary rounded-lg hover:bg-surface-hover hover:text-text-primary transition-colors text-sm';

const CourseConfigurationPanel = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState<CourseForm>({ courseName: '', displayName: '', description: '', isActive: true, displayOrder: 0 });

  const [showStageModal, setShowStageModal] = useState(false);
  const [stageCourseId, setStageCourseId] = useState('');
  const [editingStageNum, setEditingStageNum] = useState<number | null>(null);
  const [stageForm, setStageForm] = useState<StageForm>({ stageName: '' });

  const [showLevelModal, setShowLevelModal] = useState(false);
  const [levelCourseId, setLevelCourseId] = useState('');
  const [levelStageNum, setLevelStageNum] = useState(0);
  const [editingLevelNum, setEditingLevelNum] = useState<number | null>(null);
  const [levelForm, setLevelForm] = useState<LevelForm>({ levelNumber: 1, feeAmount: 0, durationMonthsMin: 0, durationMonthsMax: 0, approximateHours: 0, description: '' });

  // Fee divergence panel
  const [divergenceCourse, setDivergenceCourse] = useState<{ courseId: string; stageNum: number; levelNum: number; oldFee: number; newFee: number } | null>(null);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await AdminCoursesAPI.list();
      if (res.success && res.data) setCourses(res.data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load courses');
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchCourses(); }, []);

  // Course CRUD
  const openCreateCourse = () => {
    setEditingCourse(null);
    setCourseForm({ courseName: '', displayName: '', description: '', isActive: true, displayOrder: courses.length });
    setShowCourseModal(true);
  };
  const openEditCourse = (c: Course) => {
    setEditingCourse(c);
    setCourseForm({ courseName: c.courseName, displayName: c.displayName, description: c.description || '', isActive: c.isActive, displayOrder: c.displayOrder });
    setShowCourseModal(true);
  };
  const submitCourse = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      if (editingCourse) {
        await AdminCoursesAPI.update(editingCourse.id || editingCourse._id!, { displayName: courseForm.displayName, description: courseForm.description, displayOrder: courseForm.displayOrder, isActive: courseForm.isActive });
        toast.success('Course updated');
      } else {
        await AdminCoursesAPI.create({ courseName: courseForm.courseName.toLowerCase().trim(), displayName: courseForm.displayName, description: courseForm.description, displayOrder: courseForm.displayOrder });
        toast.success('Course created');
      }
      setShowCourseModal(false); fetchCourses();
    } catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
    finally { setSubmitting(false); }
  };
  const deleteCourse = async (c: Course) => {
    if (!window.confirm(`Delete "${c.displayName}"?`)) return;
    try { await AdminCoursesAPI.delete(c.id || c._id!); toast.success('Deleted'); fetchCourses(); }
    catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
  };

  // Stage CRUD
  const openAddStage = (cId: string) => { setStageCourseId(cId); setEditingStageNum(null); setStageForm({ stageName: '' }); setShowStageModal(true); };
  const openEditStage = (cId: string, num: number, name: string) => { setStageCourseId(cId); setEditingStageNum(num); setStageForm({ stageName: name }); setShowStageModal(true); };
  const submitStage = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const course = courses.find((c) => (c.id || c._id) === stageCourseId)!;
      if (editingStageNum !== null) {
        await AdminCoursesAPI.updateStage(stageCourseId, editingStageNum, { stageName: stageForm.stageName });
        toast.success('Stage renamed');
      } else {
        const nextNum = (course.stages?.length ?? 0) + 1;
        await AdminCoursesAPI.addStage(stageCourseId, { stageNumber: nextNum, stageName: stageForm.stageName });
        toast.success('Stage added');
      }
      setShowStageModal(false); fetchCourses();
    } catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
    finally { setSubmitting(false); }
  };
  const deleteStage = async (cId: string, num: number, name: string) => {
    if (!window.confirm(`Delete stage "${name}" and all its levels?`)) return;
    try { await AdminCoursesAPI.deleteStage(cId, num); toast.success('Stage deleted'); fetchCourses(); }
    catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
  };

  // Level CRUD
  const openAddLevel = (cId: string, stageNum: number, nextNum: number) => { setLevelCourseId(cId); setLevelStageNum(stageNum); setEditingLevelNum(null); setLevelForm({ levelNumber: nextNum, feeAmount: 0, durationMonthsMin: 0, durationMonthsMax: 0, approximateHours: 0, description: '' }); setShowLevelModal(true); };
  const openEditLevel = (cId: string, stageNum: number, level: any) => { setLevelCourseId(cId); setLevelStageNum(stageNum); setEditingLevelNum(level.levelNumber); setLevelForm({ levelNumber: level.levelNumber, feeAmount: level.feeAmount, durationMonthsMin: level.durationMonthsMin || 0, durationMonthsMax: level.durationMonthsMax || 0, approximateHours: level.approximateHours || 0, description: level.description || '' }); setShowLevelModal(true); };
  const submitLevel = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      if (editingLevelNum !== null) {
        // Capture old fee before update for divergence check
        const currentCourse = courses.find((c) => (c.id || c._id) === levelCourseId);
        const currentStage = currentCourse?.stages?.find((s: any) => s.stageNumber === levelStageNum);
        const currentLevel = currentStage?.levels?.find((l: any) => l.levelNumber === editingLevelNum);
        const oldFee: number = currentLevel?.feeAmount ?? 0;

        await AdminCoursesAPI.updateLevel(levelCourseId, levelStageNum, editingLevelNum, { feeAmount: levelForm.feeAmount, durationMonthsMin: levelForm.durationMonthsMin || undefined, durationMonthsMax: levelForm.durationMonthsMax || undefined, approximateHours: levelForm.approximateHours, description: levelForm.description });
        toast.success('Level updated');
        setShowLevelModal(false);
        fetchCourses();

        // If fee changed, prompt the divergence workflow
        if (levelForm.feeAmount !== oldFee) {
          setDivergenceCourse({ courseId: levelCourseId, stageNum: levelStageNum, levelNum: editingLevelNum, oldFee, newFee: levelForm.feeAmount });
        }
      } else {
        await AdminCoursesAPI.addLevel(levelCourseId, levelStageNum, { levelNumber: levelForm.levelNumber, feeAmount: levelForm.feeAmount, durationMonthsMin: levelForm.durationMonthsMin || undefined, durationMonthsMax: levelForm.durationMonthsMax || undefined, approximateHours: levelForm.approximateHours, description: levelForm.description });
        toast.success('Level added');
        setShowLevelModal(false); fetchCourses();
      }
    } catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
    finally { setSubmitting(false); }
  };
  const deleteLevel = async (cId: string, stageNum: number, levelNum: number) => {
    if (!window.confirm(`Delete Level ${levelNum}?`)) return;
    try { await AdminCoursesAPI.deleteLevel(cId, stageNum, levelNum); toast.success('Level deleted'); fetchCourses(); }
    catch (e: any) { toast.error(e.response?.data?.error || e.message || 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-text-primary">Course Stages</h2>
        {courses.length === 0 && (
          <button onClick={openCreateCourse} className={btnPrimary}>+ Add Course</button>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-border">
          <p className="text-text-tertiary text-sm">No courses yet. Click "Add Course" to create one.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {courses.map((course) => {
            const cId = course.id || course._id!;
            const stages = course.stages ?? [];
            const singleCourse = courses.length === 1;
            return (
              <div key={cId} className="bg-surface rounded-lg border border-white/7 border-l-4 border-l-primary-600 p-4">
                {/* Course header — only shown when multiple courses exist */}
                {!singleCourse && (
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-text-primary">{course.displayName}</h3>
                      <p className="text-xs text-text-tertiary mt-0.5">ID: {course.courseName} · Order: {course.displayOrder}</p>
                      {course.description && <p className="text-sm text-text-secondary mt-1">{course.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${course.isActive ? 'bg-success-600/15 text-success-400 border-success-500/20' : 'bg-white/6 border-white/10 text-text-secondary'}`}>{course.isActive ? 'Active' : 'Inactive'}</span>
                      <button onClick={() => openEditCourse(course)} className="p-1.5 text-primary-600 hover:bg-surface-hover rounded-lg" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteCourse(course)} className="p-1.5 text-error-400 hover:bg-error-600/15 rounded-lg" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className={`${!singleCourse ? 'border-t border-white/7 pt-3' : ''} space-y-3`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-text-primary">Course Stages ({stages.length})</span>
                    <button onClick={() => openAddStage(cId)} className="text-xs text-primary-600 hover:text-primary-300 font-medium">+ Add Course Stage</button>
                  </div>
                  {stages.length === 0 ? (
                    <p className="text-xs text-text-tertiary italic">No course stages yet — add a course stage to define levels and fees.</p>
                  ) : stages.map((stage) => (
                    <div key={stage.stageNumber} className="border border-border rounded-lg p-3 bg-surface-alt">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-2">
                          <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-600/15 text-primary-300 text-xs font-bold flex-shrink-0 mt-0.5">{stage.stageNumber}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary text-sm">{stage.stageName}</span>
                              <span className="text-xs text-text-tertiary">
                                ({stage.levels.length} level{stage.levels.length !== 1 ? 's' : ''}
                                {(() => {
                                  const min = (stage.levels as any[]).reduce((s, l) => s + (l.durationMonthsMin || 0), 0);
                                  const max = (stage.levels as any[]).reduce((s, l) => s + (l.durationMonthsMax || 0), 0);
                                  if (!min && !max) return ')';
                                  const range = min && max && min !== max ? `${min}–${max}` : `${min || max}`;
                                  return ` · ${range} mo total)`;
                                })()}
                              </span>
                            </div>
                            {(stage as any).description && (
                              <p className="text-xs text-text-tertiary mt-0.5">{(stage as any).description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openEditStage(cId, stage.stageNumber, stage.stageName)} className="p-1 text-primary-600 hover:bg-primary-600/15 rounded" title="Rename course stage">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteStage(cId, stage.stageNumber, stage.stageName)} className="p-1 text-error-400 hover:bg-error-600/15 rounded" title="Delete course stage">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5 ml-8">
                        {stage.levels.map((level) => (
                          <div key={level.levelNumber} className="bg-surface rounded-lg px-3 py-2.5 border border-border/60">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="text-sm font-semibold text-text-primary">Level {level.levelNumber}</span>
                                <span className="text-sm text-primary-400 font-semibold">₹{level.feeAmount.toLocaleString()}/mo</span>
                                {(level.durationMonthsMin || level.durationMonthsMax) ? (
                                  <span className="text-xs text-text-tertiary">
                                    {level.durationMonthsMin && level.durationMonthsMax && level.durationMonthsMin !== level.durationMonthsMax
                                      ? `${level.durationMonthsMin}–${level.durationMonthsMax} mo`
                                      : `${level.durationMonthsMin || level.durationMonthsMax} mo`}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => openEditLevel(cId, stage.stageNumber, level)} className="p-1 text-primary-600 hover:bg-primary-600/15 rounded" title="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteLevel(cId, stage.stageNumber, level.levelNumber)} className="p-1 text-error-400 hover:bg-error-600/15 rounded" title="Delete">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {level.description && (
                              <p className="text-xs text-text-tertiary mt-1.5">{level.description}</p>
                            )}
                          </div>
                        ))}
                        <button onClick={() => openAddLevel(cId, stage.stageNumber, stage.levels.length + 1)} className="w-full text-center text-xs text-primary-600 hover:text-primary-300 border border-dashed border-primary-600/30 rounded-lg py-1.5 hover:bg-surface-hover transition-colors">
                          + Add Level
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCourseModal && (
        <Modal isOpen={showCourseModal} title={editingCourse ? 'Edit Course' : 'Add Course'} onClose={() => setShowCourseModal(false)} size="sm">
          <form onSubmit={submitCourse} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Course Name (ID) *</label>
              <input className={inputCls} value={courseForm.courseName} onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value.toLowerCase() })} placeholder="e.g., chess-standard" required disabled={!!editingCourse} />
              <p className="text-xs text-text-tertiary mt-1">Lowercase unique identifier, cannot be changed after creation.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Display Name *</label>
              <input className={inputCls} value={courseForm.displayName} onChange={(e) => setCourseForm({ ...courseForm, displayName: e.target.value })} placeholder="e.g., Chess Standard Training" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
              <textarea className={inputCls} value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} rows={2} placeholder="Optional…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Display Order</label>
                <input type="number" className={inputCls} value={courseForm.displayOrder} onChange={(e) => setCourseForm({ ...courseForm, displayOrder: parseInt(e.target.value) || 0 })} min={0} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center cursor-pointer gap-2">
                  <input type="checkbox" checked={courseForm.isActive} onChange={(e) => setCourseForm({ ...courseForm, isActive: e.target.checked })} className="w-4 h-4 text-primary-600 rounded" />
                  <span className="text-sm text-text-primary">Active</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" onClick={() => setShowCourseModal(false)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={submitting}>{submitting ? 'Saving…' : editingCourse ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showStageModal && (
        <Modal isOpen={showStageModal} title={editingStageNum !== null ? 'Rename Course Stage' : 'Add Course Stage'} onClose={() => setShowStageModal(false)} size="sm">
          <form onSubmit={submitStage} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Course Stage Name *</label>
              <input className={inputCls} value={stageForm.stageName} onChange={(e) => setStageForm({ stageName: e.target.value })} placeholder="e.g., Beginner, Intermediate, Advanced" required autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" onClick={() => setShowStageModal(false)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={submitting}>{submitting ? 'Saving…' : editingStageNum !== null ? 'Rename' : 'Add Course Stage'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showLevelModal && (
        <Modal isOpen={showLevelModal} title={editingLevelNum !== null ? `Edit Level ${editingLevelNum}` : 'Add Level'} onClose={() => setShowLevelModal(false)} size="sm">
          <form onSubmit={submitLevel} className="space-y-3">
            {editingLevelNum === null && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Level Number *</label>
                <input type="number" className={inputCls} value={levelForm.levelNumber} onChange={(e) => setLevelForm({ ...levelForm, levelNumber: parseInt(e.target.value) || 1 })} min={1} required />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Monthly Fee (₹) *</label>
              <input type="number" className={inputCls} value={levelForm.feeAmount} onChange={(e) => setLevelForm({ ...levelForm, feeAmount: parseFloat(e.target.value) || 0 })} min={0} required placeholder="e.g., 2500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Duration Min (Months)</label>
                <input type="number" className={inputCls} value={levelForm.durationMonthsMin || ''} onChange={(e) => setLevelForm({ ...levelForm, durationMonthsMin: parseInt(e.target.value) || 0 })} min={0} placeholder="e.g., 2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Duration Max (Months)</label>
                <input type="number" className={inputCls} value={levelForm.durationMonthsMax || ''} onChange={(e) => setLevelForm({ ...levelForm, durationMonthsMax: parseInt(e.target.value) || 0 })} min={0} placeholder="e.g., 4" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Approx. Hours</label>
              <input type="number" className={inputCls} value={levelForm.approximateHours} onChange={(e) => setLevelForm({ ...levelForm, approximateHours: parseFloat(e.target.value) || 0 })} min={0} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
              <textarea className={inputCls} value={levelForm.description} onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })} rows={2} placeholder="What students learn at this level…" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" onClick={() => setShowLevelModal(false)} className={btnGhost}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={submitting}>{submitting ? 'Saving…' : editingLevelNum !== null ? 'Update Level' : 'Add Level'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Fee divergence panel — shown after a fee change */}
      {divergenceCourse && (
        <FeeDivergencePanel
          courseId={divergenceCourse.courseId}
          stageNum={divergenceCourse.stageNum}
          levelNum={divergenceCourse.levelNum}
          oldFee={divergenceCourse.oldFee}
          newFee={divergenceCourse.newFee}
          onClose={() => setDivergenceCourse(null)}
        />
      )}
    </div>
  );
};

export default CourseConfigurationPanel;
